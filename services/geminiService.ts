import { EssayType, InputMethod, EssaySubmission } from '../types';
import { getPromptForType } from '../constants';
import { api } from './api';

// Helper to convert File to Base64
const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const gradeEssay = async (submission: EssaySubmission): Promise<{ feedback: string; transcription?: string }> => {
  let promptTemplate = getPromptForType(submission.type);
  let finalContents: any = [];
  let meta: any = {
    topic: submission.questionText || 'Essay Grading',
    isImage: submission.method === InputMethod.IMAGE
  };

  if (submission.method === InputMethod.TEXT) {
    // Text based submission
    const filledPrompt = promptTemplate
      .replace('{{QUESTION}}', submission.questionText)
      .replace('{{CONTENT}}', submission.essayContent);

    finalContents = [{ parts: [{ text: filledPrompt }] }];
    meta.originalContent = submission.essayContent;

  } else {
    // Image based submission - request transcription
    const instructions = `
Please analyze the attached images carefully.

IMPORTANT: First, transcribe ALL text from the images. Output the transcription in this exact format:
<<<TRANSCRIPTION>>>
[Put all transcribed text here, preserving structure and layout]
<<<END_TRANSCRIPTION>>>

After the transcription section, provide your grading following these instructions:

${promptTemplate.replace('{{QUESTION}}', '[See Question Images]').replace('{{CONTENT}}', '[See Essay Images]')}

Remember to include the <<<TRANSCRIPTION>>> section first, then your grading analysis.
    `.trim();

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
    const payload = {
      contents: finalContents,
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7
      }
    };

    const data = await api.gradeEssay(payload, meta);

    // Extract text from Gemini response
    let feedbackText = '';
    if (data.candidates && data.candidates.length > 0 &&
      data.candidates[0].content && data.candidates[0].content.parts) {
      feedbackText = data.candidates[0].content.parts.map((p: any) => p.text || '').join('');
    }

    // Extract transcription if present
    const transcriptionMatch = feedbackText.match(/<<<TRANSCRIPTION>>>([\s\S]*?)<<<END_TRANSCRIPTION>>>/);
    let transcription = undefined;

    if (transcriptionMatch) {
      transcription = transcriptionMatch[1].trim();
      feedbackText = feedbackText.replace(/<<<TRANSCRIPTION>>>[\s\S]*?<<<END_TRANSCRIPTION>>>/, '').trim();
    }

    return {
      feedback: feedbackText || "No response generated from AI.",
      transcription
    };

  } catch (error: any) {
    console.error("Grading API Error:", error);
    throw new Error(error.message || "Failed to grade essay. Please check your connection and try again.");
  }
};