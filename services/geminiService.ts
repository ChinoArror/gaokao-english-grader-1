import { GoogleGenAI } from "@google/genai";
import { EssayType, InputMethod, EssaySubmission } from '../types';
import { getPromptForType } from '../constants';

// SECURITY: The API key is obtained exclusively from the environment variable.
// It is NOT hardcoded in the source code.
const API_KEY = process.env.API_KEY;

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const gradeEssay = async (submission: EssaySubmission): Promise<string> => {
  // Strict check: Ensure the environment variable is present.
  if (!API_KEY) {
    throw new Error("Critical Configuration Error: process.env.API_KEY is missing. The application cannot authenticate with the AI service.");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const modelId = 'gemini-3-flash-preview'; // Using Gemini 3.0 Flash for speed and intelligence

  let promptTemplate = getPromptForType(submission.type);
  let finalContents: any = [];

  if (submission.method === InputMethod.TEXT) {
    // Text based submission
    const filledPrompt = promptTemplate
      .replace('{{QUESTION}}', submission.questionText)
      .replace('{{CONTENT}}', submission.essayContent);
    
    finalContents = [{ text: filledPrompt }];

  } else {
    // Image based submission
    // We need to instruct the model to first Transcribe then Grade
    const instructions = `
      Please analyze the attached images. 
      The first set of images provided are the Question/Prompt/Background Info.
      The subsequent images are the Student's Essay.
      
      First, internally identify and transcribe the text from the images.
      Then, strictly follow the grading instructions below based on the transcribed text:
      
      ${promptTemplate.replace('{{QUESTION}}', '[See Question Images]').replace('{{CONTENT}}', '[See Essay Images]')}
    `;

    finalContents.push({ text: instructions });

    // Add Question Images
    if (submission.questionImages && submission.questionImages.length > 0) {
      for (const file of submission.questionImages) {
        const qImageBase64 = await fileToGenerativePart(file);
        finalContents.push({
          inlineData: {
            mimeType: file.type,
            data: qImageBase64
          }
        });
      }
    }

    // Add Essay Images
    if (submission.essayImages && submission.essayImages.length > 0) {
      for (const file of submission.essayImages) {
        const eImageBase64 = await fileToGenerativePart(file);
        finalContents.push({
          inlineData: {
            mimeType: file.type,
            data: eImageBase64
          }
        });
      }
    }
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: { parts: finalContents },
      config: {
        // High max tokens to ensure full feedback and sample essay
        maxOutputTokens: 4096, 
        thinkingConfig: { thinkingBudget: 1024 } // Use thinking for better reasoning on grading
      }
    });

    return response.text || "No response generated.";
  } catch (error: any) {
    // Security: Do NOT log the full 'error' object as it might contain the request URL with the API Key.
    console.error("Gemini API Error:", error.message ? error.message : "Unknown error occurred");
    throw new Error("Failed to grade essay. Please check your connection and try again.");
  }
};