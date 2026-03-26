import { EssayType, InputMethod, EssaySubmission } from '../types';
import { getPromptForType } from '../constants';
import { api } from './api';

const MAX_IMAGE_DIMENSION = 1800;
const MAX_IMAGE_FILE_SIZE = 1.5 * 1024 * 1024;
const MAX_REQUEST_PAYLOAD_BYTES = 10 * 1024 * 1024;
const JPEG_QUALITY = 0.82;

const readFileAsDataUrl = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const loadImage = async (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image.'));
    image.src = src;
  });
};

const dataUrlToBase64 = (dataUrl: string): string => {
  const parts = dataUrl.split(',');
  return parts[1] || '';
};

const estimateBase64Bytes = (base64: string): number => {
  return Math.ceil((base64.length * 3) / 4);
};

const fileToGenerativePart = async (file: File): Promise<{ mimeType: string; data: string }> => {
  const originalDataUrl = await readFileAsDataUrl(file);
  const originalBase64 = dataUrlToBase64(originalDataUrl);

  if (!file.type.startsWith('image/')) {
    return { mimeType: file.type || 'application/octet-stream', data: originalBase64 };
  }

  const image = await loadImage(originalDataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const needsResize = longestEdge > MAX_IMAGE_DIMENSION;
  const needsCompression = file.size > MAX_IMAGE_FILE_SIZE || needsResize;

  if (!needsCompression) {
    return { mimeType: file.type, data: originalBase64 };
  }

  const scale = needsResize ? MAX_IMAGE_DIMENSION / longestEdge : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    return { mimeType: file.type, data: originalBase64 };
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const compressedMimeType = 'image/jpeg';
  const compressedDataUrl = canvas.toDataURL(compressedMimeType, JPEG_QUALITY);
  const compressedBase64 = dataUrlToBase64(compressedDataUrl);

  if (estimateBase64Bytes(compressedBase64) >= estimateBase64Bytes(originalBase64)) {
    return { mimeType: file.type, data: originalBase64 };
  }

  return { mimeType: compressedMimeType, data: compressedBase64 };
};

export const gradeEssay = async (
  submission: EssaySubmission
): Promise<{ feedback: string; transcription?: string; truncated?: boolean }> => {
  let promptTemplate = getPromptForType(submission.type);
  let finalContents: any = [];
  let meta: any = {
    topic: submission.questionText || 'Essay Grading',
    isImage: submission.method === InputMethod.IMAGE,
    essayType: submission.type
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
        const qImage = await fileToGenerativePart(file);
        parts.push({
          inlineData: {
            mimeType: qImage.mimeType,
            data: qImage.data
          }
        });
      }
    }

    // Add Essay Images
    if (submission.essayImages && submission.essayImages.length > 0) {
      for (const file of submission.essayImages) {
        const eImage = await fileToGenerativePart(file);
        parts.push({
          inlineData: {
            mimeType: eImage.mimeType,
            data: eImage.data
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
        maxOutputTokens: submission.method === InputMethod.IMAGE ? 8192 : 4096,
        temperature: 0.7
      }
    };

    const estimatedPayloadBytes = new TextEncoder().encode(JSON.stringify({ payload, meta })).length;
    if (estimatedPayloadBytes > MAX_REQUEST_PAYLOAD_BYTES) {
      throw new Error('Uploaded images are too large to send for grading. Please upload fewer images or smaller photos.');
    }

    const data = await api.gradeEssay(payload, meta);

    // Extract text from Gemini response
    let feedbackText = typeof data.feedback === 'string' ? data.feedback : '';
    let transcription = typeof data.transcription === 'string' ? data.transcription : undefined;

    if (!feedbackText && data.candidates && data.candidates.length > 0 &&
      data.candidates[0].content && data.candidates[0].content.parts) {
      feedbackText = data.candidates[0].content.parts.map((p: any) => p.text || '').join('');
    }

    if (!transcription) {
      const transcriptionMatch = feedbackText.match(/<<<TRANSCRIPTION>>>([\s\S]*?)<<<END_TRANSCRIPTION>>>/);
      if (transcriptionMatch) {
        transcription = transcriptionMatch[1].trim();
        feedbackText = feedbackText.replace(/<<<TRANSCRIPTION>>>[\s\S]*?<<<END_TRANSCRIPTION>>>/, '').trim();
      }
    }

    return {
      feedback: feedbackText || "No response generated from AI.",
      transcription,
      truncated: Boolean(data.truncated)
    };

  } catch (error: any) {
    console.error("Grading API Error:", error);
    throw new Error(error.message || "Failed to grade essay. Please check your connection and try again.");
  }
};
