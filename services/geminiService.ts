import { EssayType, InputMethod, EssaySubmission } from '../types';
import { getPromptForType } from '../constants';

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
  let promptTemplate = getPromptForType(submission.type);
  let finalContents: any = [];

  if (submission.method === InputMethod.TEXT) {
    // Text based submission
    const filledPrompt = promptTemplate
      .replace('{{QUESTION}}', submission.questionText)
      .replace('{{CONTENT}}', submission.essayContent);

    finalContents = [{ parts: [{ text: filledPrompt }] }];

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

    const parts: any[] = [{ text: instructions }];

    // Add Question Images
    if (submission.questionImages && submission.questionImages.length > 0) {
      for (const file of submission.questionImages) {
        const qImageBase64 = await fileToGenerativePart(file);
        parts.push({
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
        parts.push({
          inlineData: {
            mimeType: file.type,
            data: eImageBase64
          }
        });
      }
    }

    finalContents = [{ parts: parts }];
  }

  try {
    const response = await fetch('/api/grade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: finalContents,
        generationConfig: {
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 1024 } // Optional, might be ignored by some models
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Server Error: ${response.status}`);
    }

    const data = await response.json();

    // Extract text from Gemini response structure
    // structure: { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text;
    } else {
      return "No response generated from AI.";
    }

  } catch (error: any) {
    console.error("Grading API Error:", error);
    throw new Error(error.message || "Failed to grade essay. Please check your connection and try again.");
  }
};