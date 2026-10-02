# Third-party notices

- **OpenAI Codex — Apache-2.0.** The patch in `patches/native-checkpoint.patch` modifies [OpenAI Codex](https://github.com/openai/codex) at commit `a956835d020762cb2b570053af06f643a11c0ecc`. Changes add the native generation checkpoint, evaluator context, Astra-Jev model entry, and effort notifications. Original attribution and terms are preserved in [LICENSE.codex](patches/LICENSE.codex) and [NOTICE.codex](patches/NOTICE.codex).
- **gpt-tokenizer 4.0.0 — MIT.** By Bazyli Brzoska and contributors. Used to count evaluator request tokens and bound tool-result previews with `o200k_base`; this is not Jev's exact tokenizer. npm installs the dependency's license alongside its code.
