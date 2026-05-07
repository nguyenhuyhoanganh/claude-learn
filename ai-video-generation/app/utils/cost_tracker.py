from dataclasses import dataclass, field

# Approximate cost rates per unit (USD)
COST_RATES = {
    # Image generation
    "flux_pro_ultra": 0.06,       # per image
    "instantid": 0.05,            # per image
    "idm_vton": 0.075,            # per image (Replicate)
    "fashn_tryon": 0.075,         # per image
    # Video generation (per second of output)
    "kling_v2_5_turbo": 0.07,     # per second
    "kling_v3_master": 0.112,     # per second
    "runway_gen4_turbo": 0.12,    # per second
    "wan2_1": 0.015,              # per second (fal.ai)
    # Audio
    "elevenlabs": 0.0003,         # per character
    "openai_tts": 0.000015,       # per character
    "musicgen": 0.0023,           # per second
    # LLM
    "gpt4o_input": 0.0000025,     # per token
    "gpt4o_output": 0.00001,      # per token
}


@dataclass
class CostTracker:
    items: list[dict] = field(default_factory=list)
    total: float = 0.0

    def add(self, service: str, quantity: float, unit: str = "") -> float:
        rate = COST_RATES.get(service, 0.0)
        cost = rate * quantity
        self.items.append({"service": service, "quantity": quantity, "unit": unit, "cost": cost})
        self.total += cost
        return cost

    def add_image(self, service: str, n: int = 1) -> float:
        return self.add(service, n, "images")

    def add_video(self, service: str, seconds: float) -> float:
        return self.add(service, seconds, "seconds")

    def add_tts(self, service: str, characters: int) -> float:
        return self.add(service, characters, "chars")

    def add_music(self, seconds: float) -> float:
        return self.add("musicgen", seconds, "seconds")

    def add_llm(self, input_tokens: int, output_tokens: int) -> float:
        in_cost = self.add("gpt4o_input", input_tokens, "tokens")
        out_cost = self.add("gpt4o_output", output_tokens, "tokens")
        return in_cost + out_cost

    def summary(self) -> dict:
        by_service: dict[str, float] = {}
        for item in self.items:
            by_service[item["service"]] = by_service.get(item["service"], 0.0) + item["cost"]
        return {"total_usd": round(self.total, 4), "by_service": by_service, "items": self.items}
