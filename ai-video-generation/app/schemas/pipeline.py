from typing import Optional
from dataclasses import dataclass, field


@dataclass
class Scene:
    scene_id: int
    time_range: str
    scene_type: str
    description: str
    video_prompt: str
    narration_text: str
    text_overlay: Optional[str] = None
    transition: str = "crossfade"


@dataclass
class PromptPlan:
    product_name: str
    product_category: str
    tone: str
    target_audience: str
    language: str
    music_mood: str
    image_prompts: list[str] = field(default_factory=list)
    storyboard: list[Scene] = field(default_factory=list)
    narration_script: str = ""


@dataclass
class GeneratedImage:
    image_id: int
    storage_key: str
    url: str
    prompt: str
    model: str
    quality_score: float = 0.0


@dataclass
class VideoChunk:
    chunk_id: int
    scene_id: int
    storage_key: str
    url: str
    prompt: str
    model: str
    duration: int
    quality_score: float = 0.0
    variant: str = "main"


@dataclass
class AudioResult:
    voiceover_key: str
    music_key: str
    final_audio_key: str
    duration: float


@dataclass
class PipelineState:
    job_id: str
    prompt: str
    product_image_keys: list[str]
    face_image_keys: list[str]
    n_chunks: int
    chunk_duration: int
    language: str
    tone: str
    video_model: str

    prompt_plan: Optional[PromptPlan] = None
    images: list[GeneratedImage] = field(default_factory=list)
    video_chunks: list[VideoChunk] = field(default_factory=list)
    selected_chunks: list[VideoChunk] = field(default_factory=list)
    audio: Optional[AudioResult] = None
    output_keys: dict[str, str] = field(default_factory=dict)
    total_cost: float = 0.0

    @property
    def target_duration(self) -> int:
        return self.n_chunks * self.chunk_duration
