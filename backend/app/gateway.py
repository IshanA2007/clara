import json
import uuid
from typing import Any

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

from app.models import (
    ErrorResponse,
    PipelineStage,
    PresentationMetadata,
    PresentationResults,
    ProcessingStatus,
    ProgressInfo,
    StatusResponse,
    Tone,
    UploadResponse,
)

router = APIRouter(prefix="/api")

MAX_AUDIO_BYTES = 100 * 1024 * 1024  # 100MB

STAGE_STEPS: dict[str, tuple[int, str]] = {
    "received":    (1, "Upload received, queued for processing"),
    "transcribing": (2, "Transcribing audio"),
    "indexing":    (3, "Mapping transcript to slides"),
    "analyzing":   (4, "Running manual analytics + LLM feedback"),
    "aggregating": (5, "Combining results"),
}


def _error(error: str, message: str, status_code: int, field: str | None = None,
           status: str | None = None, presentation_id: str | None = None) -> JSONResponse:
    body: dict[str, Any] = {"error": error, "message": message}
    if field is not None:
        body["field"] = field
    if status is not None:
        body["status"] = status
    if presentation_id is not None:
        body["presentation_id"] = presentation_id
    return JSONResponse(status_code=status_code, content=body)


@router.post("/presentations", status_code=202)
async def create_presentation(
    request: Request,
    audio: UploadFile = File(...),
    metadata: str = Form(...),
) -> JSONResponse:
    # --- Audio validation ---
    audio_bytes = await audio.read()

    if not audio_bytes:
        return _error(
            "validation_error",
            "Audio file must not be empty",
            400,
            field="audio",
        )

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        return _error(
            "file_too_large",
            "Audio file must be under 100MB",
            413,
        )

    # --- Metadata validation ---
    try:
        metadata_dict = json.loads(metadata)
    except json.JSONDecodeError:
        return _error("validation_error", "metadata must be valid JSON", 400, field="metadata")

    try:
        meta = PresentationMetadata(**metadata_dict)
    except Exception as exc:
        # Surface the first Pydantic validation message
        msg = str(exc)
        return _error("validation_error", msg, 400, field="metadata")

    # slide_timestamps sorted ascending
    ts = meta.slide_timestamps
    for i in range(len(ts) - 1):
        if ts[i] > ts[i + 1]:
            return _error(
                "validation_error",
                "slide_timestamps must be sorted ascending",
                400,
                field="slide_timestamps",
            )

    # slide_timestamps length >= total_slides
    if len(ts) < meta.total_slides:
        return _error(
            "validation_error",
            "slide_timestamps length must be >= total_slides",
            400,
            field="slide_timestamps",
        )

    # --- Generate presentation ID and store initial state ---
    presentation_id = str(uuid.uuid4())

    presentations = request.app.presentations  # type: ignore[attr-defined]
    presentations[presentation_id] = {
        "status": ProcessingStatus.processing,
        "stage": PipelineStage.received,
        "metadata": meta,
        "audio_bytes": audio_bytes,
        "results": None,
        "error_message": None,
    }

    # TODO: kick off background processing pipeline (Task 10)

    return JSONResponse(
        status_code=202,
        content=UploadResponse(
            presentation_id=presentation_id,
            status="processing",
            message="Presentation received. Poll status endpoint for progress.",
        ).model_dump(),
    )


@router.get("/presentations/{presentation_id}/status")
async def get_status(presentation_id: str, request: Request) -> JSONResponse:
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    status: ProcessingStatus = record["status"]

    if status == ProcessingStatus.completed:
        return JSONResponse(
            status_code=200,
            content=StatusResponse(
                presentation_id=presentation_id,
                status=ProcessingStatus.completed,
            ).model_dump(exclude_none=True),
        )

    if status == ProcessingStatus.failed:
        return JSONResponse(
            status_code=200,
            content=StatusResponse(
                presentation_id=presentation_id,
                status=ProcessingStatus.failed,
                error="processing_failed",
                message=record.get("error_message") or "An error occurred during processing",
            ).model_dump(exclude_none=True),
        )

    # status == processing
    stage: PipelineStage = record["stage"]
    step_num, step_name = STAGE_STEPS[stage.value]

    return JSONResponse(
        status_code=200,
        content=StatusResponse(
            presentation_id=presentation_id,
            status=ProcessingStatus.processing,
            stage=stage,
            progress=ProgressInfo(
                current_step=step_num,
                total_steps=5,
                step_name=step_name,
            ),
        ).model_dump(exclude_none=True),
    )


@router.get("/presentations/{presentation_id}/results")
async def get_results(presentation_id: str, request: Request) -> JSONResponse:
    presentations = request.app.presentations  # type: ignore[attr-defined]

    record = presentations.get(presentation_id)
    if record is None:
        return _error("not_found", "Presentation not found", 404)

    status: ProcessingStatus = record["status"]

    if status == ProcessingStatus.processing:
        return _error(
            "not_ready",
            "Processing is still in progress. Poll the status endpoint.",
            409,
            status="processing",
        )

    if status == ProcessingStatus.failed:
        return _error("not_found", "Presentation not found", 404)

    # status == completed
    results: PresentationResults = record["results"]
    return JSONResponse(status_code=200, content=results.model_dump())
