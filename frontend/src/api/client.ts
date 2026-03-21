import type {
  PresentationMetadata,
  SubmitResponse,
  StatusResponse,
  PresentationResults,
  ApiError,
} from '../types';

const BASE_URL = '/api';

class ApiClientError extends Error {
  constructor(public readonly apiError: ApiError) {
    super(apiError.message);
    this.name = 'ApiClientError';
  }
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    return await res.json();
  } catch {
    return { error: 'unknown_error', message: `Request failed with status ${res.status}` };
  }
}

export async function submitPresentation(
  audio: Blob,
  metadata: PresentationMetadata,
): Promise<SubmitResponse> {
  const formData = new FormData();
  formData.append('audio', audio, 'recording.webm');
  formData.append('metadata', JSON.stringify(metadata));

  const res = await fetch(`${BASE_URL}/presentations`, {
    method: 'POST',
    body: formData,
  });

  if (res.status === 202) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export async function getStatus(presentationId: string): Promise<StatusResponse> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/status`);

  if (res.ok) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export async function getResults(presentationId: string): Promise<PresentationResults> {
  const res = await fetch(`${BASE_URL}/presentations/${presentationId}/results`);

  if (res.ok) {
    return res.json();
  }

  throw new ApiClientError(await parseErrorResponse(res));
}

export { ApiClientError };
