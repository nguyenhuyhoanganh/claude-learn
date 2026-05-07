import json
from app.config import settings
from app.pipeline.state import PipelineState, PromptPlan, Scene
from app.utils.cost_tracker import CostTracker


_SYSTEM_PROMPT = """You are a creative director for product video advertisements.
Given a product description and images, you generate:
1. A concise narration script (30-60 seconds)
2. A scene breakdown for video generation
3. Image prompts for generating product/model photos

Always respond with valid JSON matching the specified schema."""

_USER_TEMPLATE = """Product prompt: {prompt}
Language: {language}
Tone: {tone}
Number of scenes: {n_scenes}
Scene duration: {duration}s each

Generate a video production plan as JSON:
{{
  "narration_script": "...",
  "scenes": [
    {{
      "index": 0,
      "description": "...",
      "camera_angle": "wide shot / close-up / medium shot / ...",
      "duration": {duration},
      "video_prompt": "...",
      "image_prompt": "..."
    }}
  ],
  "image_prompts": ["...", "..."]
}}"""


class PromptAgent:
    async def run(self, state: PipelineState, cost_tracker: CostTracker) -> PipelineState:
        if settings.mock:
            state["prompt_plan"] = self._mock_plan(state)
            return state

        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        user_msg = _USER_TEMPLATE.format(
            prompt=state["prompt"],
            language=state.get("language", "vi"),
            tone=state.get("tone", "professional"),
            n_scenes=state["n_chunks"],
            duration=state["chunk_duration"],
        )

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.7,
            response_format={"type": "json_object"},
        )

        usage = response.usage
        cost_tracker.add_llm(usage.prompt_tokens, usage.completion_tokens)
        state["cost_usd"] = (state.get("cost_usd") or 0.0) + cost_tracker.total

        raw = json.loads(response.choices[0].message.content)
        state["prompt_plan"] = self._parse_plan(raw, state)
        return state

    def _parse_plan(self, raw: dict, state: PipelineState) -> PromptPlan:
        scenes = [
            Scene(
                index=s["index"],
                description=s["description"],
                camera_angle=s.get("camera_angle", "medium shot"),
                duration=s.get("duration", state["chunk_duration"]),
                video_prompt=s["video_prompt"],
                image_prompt=s["image_prompt"],
            )
            for s in raw.get("scenes", [])
        ]
        return PromptPlan(
            narration_script=raw.get("narration_script", ""),
            scenes=scenes,
            image_prompts=raw.get("image_prompts", []),
            language=state.get("language", "vi"),
            tone=state.get("tone", "professional"),
        )

    def _mock_plan(self, state: PipelineState) -> PromptPlan:
        n = state["n_chunks"]
        scenes = [
            Scene(
                index=i,
                description=f"Scene {i}: showcase product from {'wide' if i == 0 else 'close-up'} angle",
                camera_angle="wide shot" if i == 0 else "close-up",
                duration=state["chunk_duration"],
                video_prompt=f"Professional product showcase, scene {i}, smooth camera movement, 4K quality",
                image_prompt=f"Product lifestyle photo scene {i}, bright studio lighting, clean background",
            )
            for i in range(n)
        ]
        return PromptPlan(
            narration_script=f"Introducing {state['prompt']}. Experience the difference today.",
            scenes=scenes,
            image_prompts=[f"Product photo {i}, professional lighting" for i in range(min(n, 5))],
            language=state.get("language", "vi"),
            tone=state.get("tone", "professional"),
        )
