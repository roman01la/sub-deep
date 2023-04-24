Transcribe audio and translate transcribed subtitles using [WhisperX](https://github.com/m-bain/whisperX) running on [JarvisLabs.ai](https://jarvislabs.ai/) for $0.49/hr and [DeepL](https://deepl.com) API. Takes 2-3 minutes of compute time to transcribe a short clip.

## Usage

1. Add your SSH key to your JarvisLabs.ai account at https://cloud.jarvislabs.ai/listsshkeys

2. Create `.env` file with the following content

```
DEEPL_KEY={your deepl.com API key}
JARVISLABS_KEY={your jarvislabs.ai API key}
JARVISLABS_UID={your jarvislabs.ai email address}
```

3. Install deps and run the script. This will spin up a small instance, upload audio file, transcribe it, download back and call DeepL API to translate subtitles.

```shell
yarn # install deps

# transcribe and translate
./transcribe.js audio.wav ./subs.srt uk en /path/to/id_rsa ssh-passphrase
```

CLI arguments in order:

1. WAV file
2. relative path to output file for SRT subtitles
3. Input language in the audio file
4. Output language for translated subtitles (will be saved on disk with `_{lang}` suffix in the filename)
5. Absolute path to your private SSH key
6. A pass phrase for your private key

You can retreive WAV audio from video file using `ffmpeg`

```shell
ffmpeg -i video.mp4 -vn -ac 1 audio.wav
```

_If you find this tool useful — consider endorcing my work with a small donation_

[![](https://www.buymeacoffee.com/assets/img/guidelines/download-assets-sm-1.svg)](https://www.buymeacoffee.com/romanliutikov)
