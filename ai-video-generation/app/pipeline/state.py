from dataclasses import dataclass, field
from typing import TypedDict


@dataclass
class Scene:
    index: int
    description: str
    camera_angle: str
    duration: int  # seconds
    video_prompt: str
    image_prompt: str


@dataclass
class PromptPlan:
    narration_script: str
    scenes: list[Scene]
    image_prompts: list[str]
    language: str
    tone: str


@dataclass
class GeneratedImage:
    url: str
    storage_key: str
    scene_index: int
    quality_score: float = 0.0
    generation_method: str = "flux"  # flux | instantid | idm_vton | fashn


@dataclass
class VideoChunk:
    chunk_id: int
    scene_index: int
    url: str
    storage_key: str
    duration: float
    quality_score: float = 0.0
    model: str = "kling"


@dataclass
class AudioResult:
    speech_key: str
    music_key: str | None
    duration: float
    script: str


class PipelineState(TypedDict):
    job_id: str
    prompt: str
    product_image_keys: list[str]
    face_image_keys: list[str]
    n_chunks: int
    chunk_duration: int
    language: str
    tone: str
    video_model: str

    # Phase outputs
    prompt_plan: PromptPlan | None
    generated_images: list[GeneratedImage]
    video_chunks: list[VideoChunk]
    selected_chunks: list[VideoChunk]
    audio_result: AudioResult | None
    final_video_key: str | None

    # Tracking
    cost_usd: float
    error: str | None
    phase: str
