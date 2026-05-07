import asyncio
from app.config import settings

_ELEVEN_VOICES = {
    "vi_female": "21m00Tcm4TlvDq8ikWAM",
    "vi_male":   "pNInz6obpgDQGcFmaJgB",
    "en_female": "EXAVITQu4vr4xnSDxMaL",
}
_OPENAI_VOICES = {
    "vi_female": "nova",
    "vi_male":   "onyx",
    "en_female": "shimmer",
}


class ElevenLabsClient:
    async def tts(self, text: str, voice_key: str = "vi_female") -> bytes:
        from elevenlabs import ElevenLabs, Voice, VoiceSettings
        client = ElevenLabs(api_key=settings.elevenlabs_api_key)
        audio = await asyncio.to_thread(
            client.generate,
            text=text,
            voice=Voice(
                voice_id=_ELEVEN_VOICES.get(voice_key, _ELEVEN_VOICES["vi_female"]),
                settings=VoiceSettings(stability=0.6, similarity_boost=0.8, style=0.4),
            ),
            model="eleven_multilingual_v2",
            output_format="mp3_44100_192",
        )
        return b"".join(audio)


class OpenAITTSClient:
    async def tts(self, text: str, voice_key: str = "vi_female") -> bytes:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.audio.speech.create(
            model="tts-1-hd",
            voice=_OPENAI_VOICES.get(voice_key, "nova"),
            input=text,
            response_format="mp3",
            speed=0.95,
        )
        return response.content
