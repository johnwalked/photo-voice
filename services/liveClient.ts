
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from "@google/genai";

export interface LiveClientConfig {
  onOpen?: () => void;
  onClose?: () => void;
  onAudioData?: (data: Uint8Array) => void; // For visualizer
  onToolCall?: (toolCall: any) => Promise<any>;
  onTranscription?: (text: string, source: 'user' | 'model', isFinal: boolean) => void;
  onError?: (error: Error) => void;
}

export class LiveClient {
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private nextStartTime: number = 0;
  private config: LiveClientConfig;
  private stream: MediaStream | null = null;
  
  // Transcription buffers
  private currentInputText: string = '';
  private currentOutputText: string = '';

  constructor(config: LiveClientConfig) {
    this.config = config;
  }

  async connect(apiKey: string) {
    const key = apiKey || process.env.API_KEY;
    if (!key) {
        throw new Error("API Key is missing.");
    }

    // Initialize AI client here to ensure it uses the latest API_KEY
    const ai = new GoogleGenAI({ apiKey: key });

    // Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    // Define Tool for Image Editing
    const editImageTool: FunctionDeclaration = {
      name: 'edit_image',
      description: 'Edit the current image based on the user\'s verbal instruction. Use this whenever the user asks to change, modify, enhance, or filter the image.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          prompt: {
            type: Type.STRING,
            description: 'The clear, descriptive instruction for the image edit (e.g., "remove background", "add neon lights", "make it black and white"). Translating Amharic requests to English prompts is recommended for best results.',
          },
        },
        required: ['prompt'],
      },
    };

    // Connect to Gemini Live
    this.sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        tools: [{ functionDeclarations: [editImageTool] }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        },
        systemInstruction: `You are Tigist, a warm, loving, and tech-savvy Ethiopian diaspora auntie living in New York City.
        
        YOUR VIBE:
        - You are that cool auntie ("Ye Arada Etet") who lives in Harlem or Brooklyn.
        - You are VERY supportive ("Yene mar", "Yene konjo", "My dear").
        - You keep your responses SHORT and SWEET. No long paragraphs. Just quick, warm interactions.
        
        LANGUAGE (HEAVY AMHARIC & ENGLISH MIX):
        - Use Amharic often. Start or end sentences with it.
        - Common words to use: "Eshi" (Okay), "Abet" (Yes?), "Betam Konjo" (Very beautiful), "Gobez" (Clever/Good job), "Ayzo" (Be strong/Don't worry), "Ere!" (Wow!), "Beka" (Enough/Done), "Min lirdash?" (How can I help?).
        - Address the user as "Yene woob", "Yene mar", or "Honey".
        
        BEHAVIOR:
        - When asked to edit, just say "Eshi, I got you" or "Beka, consider it done" and trigger the tool.
        - If the photo looks good, hype it up: "Ere! Betam arif new!"
        - If the user is quiet, check in: "Ayzo, I am here. Min inisra?" (What shall we do?)
        `,
      },
      callbacks: {
        onopen: () => {
          console.log("Live Session Opened");
          this.startAudioInput();
          this.config.onOpen?.();
        },
        onmessage: async (message: LiveServerMessage) => {
          // Handle Audio Output
          const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
          if (audioData) {
            this.playAudio(audioData);
          }

          // Handle Transcription
          if (message.serverContent?.inputTranscription) {
             this.currentInputText += message.serverContent.inputTranscription.text;
             this.config.onTranscription?.(this.currentInputText, 'user', false);
          }
          if (message.serverContent?.outputTranscription) {
             this.currentOutputText += message.serverContent.outputTranscription.text;
             this.config.onTranscription?.(this.currentOutputText, 'model', false);
          }
          if (message.serverContent?.turnComplete) {
             // Turn complete, reset buffers for next turn
             this.config.onTranscription?.(this.currentOutputText, 'model', true);
             this.currentInputText = '';
             this.currentOutputText = '';
          }

          // Handle Tool Calls
          if (message.toolCall) {
             console.log("Tool Call Received:", message.toolCall);
             const responses = [];
             for (const fc of message.toolCall.functionCalls) {
                if (this.config.onToolCall) {
                    // Execute the tool locally
                    const result = await this.config.onToolCall(fc);
                    responses.push({
                        id: fc.id,
                        name: fc.name,
                        response: { result: result || "success" }
                    });
                }
             }
             
             // Send Tool Response back to model
             this.sessionPromise?.then(session => {
                 session.sendToolResponse({ functionResponses: responses });
             });
          }
        },
        onclose: () => {
            console.log("Live Session Closed");
            this.config.onClose?.();
        },
        onerror: (err) => {
            console.error("Live Session Error", err);
            this.config.onError?.(new Error("Connection error"));
        }
      }
    });
  }

  private async startAudioInput() {
    if (!this.inputAudioContext) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputSource = this.inputAudioContext.createMediaStreamSource(this.stream);
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        // Downsample/Convert to PCM 16kHz if needed, but context is already 16k.
        // Just convert Float32 to Int16 for the API
        const pcmData = this.floatTo16BitPCM(inputData);
        const base64Data = this.arrayBufferToBase64(pcmData.buffer);

        // Send to API
        this.sessionPromise?.then(session => {
            session.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Data
                }
            });
        });
        
        // Visualization callback
        this.config.onAudioData?.(new Uint8Array(pcmData.buffer));
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination); 
    } catch (err) {
      console.error("Microphone access denied", err);
      this.config.onError?.(new Error("Microphone access denied"));
    }
  }

  // Send an image frame to the model (so it can see what it's editing)
  async sendImageFrame(base64Image: string) {
      if (!this.sessionPromise) return;
      
      // Remove header if present
      const base64Data = base64Image.split(',')[1] || base64Image;
      
      this.sessionPromise.then(session => {
          session.sendRealtimeInput({
              media: {
                  mimeType: 'image/jpeg', 
                  data: base64Data
              }
          });
          console.log("Image frame sent to Live Model");
      });
  }

  private playAudio(base64String: string) {
     if (!this.outputAudioContext) return;

     const audioData = this.base64ToArrayBuffer(base64String);
     const float32Data = this.pcm16ToFloat32(audioData);
     
     const buffer = this.outputAudioContext.createBuffer(1, float32Data.length, 24000);
     buffer.getChannelData(0).set(float32Data);

     const source = this.outputAudioContext.createBufferSource();
     source.buffer = buffer;
     source.connect(this.outputAudioContext.destination);
     
     // Scheduling
     const currentTime = this.outputAudioContext.currentTime;
     if (this.nextStartTime < currentTime) {
         this.nextStartTime = currentTime;
     }
     source.start(this.nextStartTime);
     this.nextStartTime += buffer.duration;
  }

  async disconnect() {
    if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
    }
    if (this.inputSource) {
        this.inputSource.disconnect();
    }
    if (this.inputAudioContext) {
        await this.inputAudioContext.close();
    }
    if (this.outputAudioContext) {
        await this.outputAudioContext.close();
    }
    // No explicit close method on session object in SDK currently, logic relies on dropping ref
    this.sessionPromise = null;
    
    // Reset buffers
    this.currentInputText = '';
    this.currentOutputText = '';
  }

  // Utils
  private floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  private pcm16ToFloat32(buffer: ArrayBuffer) {
      const int16 = new Int16Array(buffer);
      const float32 = new Float32Array(int16.length);
      for(let i=0; i<int16.length; i++) {
          float32[i] = int16[i] / 32768.0;
      }
      return float32;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
