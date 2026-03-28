import { GradeEssayRequest, GradeEssayResponse, EssaySubmission, InputMethod } from '../types';
import { api } from './api';

const MAX_IMAGE_DIMENSION = 1400;
const TARGET_IMAGE_FILE_SIZE = 850 * 1024;
const MAX_REQUEST_PAYLOAD_BYTES = 6 * 1024 * 1024;
const INITIAL_JPEG_QUALITY = 0.76;
const MIN_JPEG_QUALITY = 0.52;
const SCALE_STEP = 0.88;
const MAX_COMPRESSION_PASSES = 6;

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

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const canvasToBlob = (canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });

const compressImageFile = async (file: File): Promise<File> => {
  const originalDataUrl = await readFileAsDataUrl(file);
  const originalBlob = await dataUrlToBlob(originalDataUrl);

  if (!file.type.startsWith('image/')) {
    return file;
  }

  const image = await loadImage(originalDataUrl);
  const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
  let scale = longestEdge > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / longestEdge : 1;
  let quality = INITIAL_JPEG_QUALITY;
  let bestBlob: Blob | null = null;
  const compressedMimeType = 'image/jpeg';

  for (let pass = 0; pass < MAX_COMPRESSION_PASSES; pass++) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, compressedMimeType, quality);
    if (!blob) {
      break;
    }

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (blob.size <= TARGET_IMAGE_FILE_SIZE) {
      bestBlob = blob;
      break;
    }

    if (quality > MIN_JPEG_QUALITY) {
      quality = Math.max(MIN_JPEG_QUALITY, quality - 0.08);
    } else {
      scale *= SCALE_STEP;
    }
  }

  const finalBlob = bestBlob && bestBlob.size < originalBlob.size ? bestBlob : originalBlob;
  const finalType = finalBlob === originalBlob ? (file.type || originalBlob.type || compressedMimeType) : compressedMimeType;
  const extension = finalType === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'img');
  const safeName = file.name.replace(/\.[^.]+$/, '') || 'upload';

  return new File([finalBlob], `${safeName}.${extension}`, {
    type: finalType,
    lastModified: file.lastModified,
  });
};

export const gradeEssay = async (
  submission: EssaySubmission
): Promise<GradeEssayResponse> => {
  const request: GradeEssayRequest = {
    type: submission.type,
    method: submission.method,
    questionText: submission.questionText,
    essayContent: submission.essayContent,
  };

  let formData: FormData | null = null;

  if (submission.method === InputMethod.IMAGE) {
    formData = new FormData();
    formData.append('type', submission.type);
    formData.append('method', submission.method);

    if (submission.questionText.trim()) {
      formData.append('questionText', submission.questionText.trim());
    }

    if (submission.essayContent.trim()) {
      formData.append('essayContent', submission.essayContent.trim());
    }

    let totalPayloadBytes = 0;

    if (submission.questionImages && submission.questionImages.length > 0) {
      for (const file of submission.questionImages) {
        const compressedFile = await compressImageFile(file);
        totalPayloadBytes += compressedFile.size;
        formData.append('questionImages', compressedFile, compressedFile.name);
      }
    }

    if (submission.essayImages && submission.essayImages.length > 0) {
      for (const file of submission.essayImages) {
        const compressedFile = await compressImageFile(file);
        totalPayloadBytes += compressedFile.size;
        formData.append('essayImages', compressedFile, compressedFile.name);
      }
    }

    if (totalPayloadBytes > MAX_REQUEST_PAYLOAD_BYTES) {
      throw new Error('Uploaded images are still too large after compression. Please upload fewer images or smaller photos.');
    }
  }

  try {
    const estimatedPayloadBytes = new TextEncoder().encode(JSON.stringify(request)).length;
    if (!formData && estimatedPayloadBytes > MAX_REQUEST_PAYLOAD_BYTES) {
      throw new Error('Uploaded images are too large to send for grading. Please upload fewer images or smaller photos.');
    }

    const data = await api.gradeEssay(formData ?? request, {
      isImage: submission.method === InputMethod.IMAGE,
    }) as GradeEssayResponse;
    if (!data.task_uuid || !data.status) {
      throw new Error('The grading service did not return a task id.');
    }
    return data;

  } catch (error: any) {
    console.error("Grading API Error:", error);
    throw new Error(error.message || "Failed to grade essay. Please check your connection and try again.");
  }
};
