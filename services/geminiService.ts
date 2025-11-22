
import { GoogleGenAI, Modality } from "@google/genai";

/**
 * Edits an image using Gemini 2.5 Flash Image model.
 * 
 * @param base64Image The base64 string of the image (including data:image/... prefix or raw).
 * @param prompt The text instruction for editing (e.g., "Remove background", "Add retro filter").
 * @returns The edited image as a base64 string.
 */
export const editImage = async (base64Image: string, prompt: string): Promise<string> => {
  try {
    // Initialize Gemini Client inside the function to ensure we get the latest API_KEY
    // after the user has selected it via the UI.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Clean base64 string if it contains metadata
    const base64Data = base64Image.split(',')[1] || base64Image;
    // Detect mime type or default to jpeg if unknown (though usually handled by split)
    const mimeTypeMatch = base64Image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        }
      ],
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const candidate = response.candidates?.[0];

    if (!candidate) {
        throw new Error("No candidates returned from Gemini API.");
    }

    // Check for safety or refusal
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        // If finishReason is present and not STOP, it likely failed due to safety or other filters
        if (!candidate.content?.parts?.length) {
             throw new Error(`Gemini refused to generate content. Reason: ${candidate.finishReason}`);
        }
    }

    const parts = candidate.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("No content generated from Gemini (empty parts).");
    }

    // Look for the image part
    for (const part of parts) {
      if (part.inlineData) {
        const generatedBase64 = part.inlineData.data;
        // The SDK returns raw base64. Defaulting to image/png for generated output.
        return `data:image/png;base64,${generatedBase64}`;
      }
    }

    throw new Error("No image data found in response.");
  } catch (error: any) {
    console.error("Gemini Image Edit Error:", error);
    throw error;
  }
};
