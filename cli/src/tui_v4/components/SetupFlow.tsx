import { Box, Text, useInput } from "ink";
import { useState } from "react";
import {
  getDefaultHostedConfig,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  writeConfig,
  type Provider,
  type SantraConfig,
} from "../../utils/config.ts";

type SetupMode = "santra" | "byok";
type SetupStep = "mode" | "provider" | "model" | "apikey" | "done";

const PROVIDERS = Object.keys(PROVIDER_LABELS) as Provider[];
const MODE_OPTIONS: Array<{
  id: SetupMode;
  label: string;
  description: string;
}> = [
  {
    id: "santra",
    label: "With Santra's model",
    description: "Taste the dish with the hosted default model and trial tokens.",
  },
  {
    id: "byok",
    label: "BYOK",
    description: "Bring your own key, provider, and model.",
  },
];

interface Props {
  onComplete: () => void;
}

export function SetupFlow({ onComplete }: Props) {
  const [step, setStep] = useState<SetupStep>("mode");
  const [selectedModeIdx, setSelectedModeIdx] = useState(0);
  const [selectedProviderIdx, setSelectedProviderIdx] = useState(0);
  const [selectedModelIdx, setSelectedModelIdx] = useState(0);
  const [apiKey, setApiKey] = useState("");

  const selectedMode = MODE_OPTIONS[selectedModeIdx]!.id;
  const selectedProvider = PROVIDERS[selectedProviderIdx]!;
  const models = PROVIDER_MODELS[selectedProvider];

  useInput((input, key) => {
    if (step === "mode") {
      if (key.upArrow) {
        setSelectedModeIdx((i) => (i === 0 ? MODE_OPTIONS.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedModeIdx((i) => (i === MODE_OPTIONS.length - 1 ? 0 : i + 1));
        return;
      }
      if (key.return || input === "\r") {
        if (selectedMode === "santra") {
          writeConfig(getDefaultHostedConfig());
          setStep("done");
          setTimeout(onComplete, 800);
          return;
        }
        setStep("provider");
        return;
      }
      return;
    }

    if (step === "provider") {
      if (key.upArrow) {
        setSelectedProviderIdx((i) => (i === 0 ? PROVIDERS.length - 1 : i - 1));
        setSelectedModelIdx(0);
        return;
      }
      if (key.downArrow) {
        setSelectedProviderIdx((i) => (i === PROVIDERS.length - 1 ? 0 : i + 1));
        setSelectedModelIdx(0);
        return;
      }
      if (key.return || input === "\r") {
        setStep("model");
        return;
      }
      return;
    }

    if (step === "model") {
      if (key.upArrow) {
        setSelectedModelIdx((i) => (i === 0 ? models.length - 1 : i - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedModelIdx((i) => (i === models.length - 1 ? 0 : i + 1));
        return;
      }
      if (key.escape) {
        setStep("mode");
        return;
      }
      if (key.return || input === "\r") {
        setStep("apikey");
        return;
      }
      return;
    }

    if (step === "apikey") {
      if (key.return || input === "\r") {
        if (!apiKey.trim()) return;
        const config: SantraConfig = {
          version: 2,
          authMode: "byok",
          provider: selectedProvider,
          model: models[selectedModelIdx]!,
          apiKey: apiKey.trim(),
        };
        writeConfig(config);
        setStep("done");
        setTimeout(onComplete, 800);
        return;
      }
      if (key.backspace || key.delete || input === "\u007f" || input === "\b") {
        setApiKey((s) => s.slice(0, -1));
        return;
      }
      if (key.escape) {
        setApiKey("");
        setStep("model");
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        const printable = input.replace(/[^\x20-\x7e]/g, "");
        if (printable) setApiKey((s) => s + printable);
      }
      return;
    }
  });

  if (step === "done") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="green">✓ Config saved. Starting santra…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
      <Box flexDirection="column">
        <Text bold color="#F97316">santra</Text>
        <Text color="#888580">Choose hosted trial access or bring your own key.</Text>
      </Box>

      {step === "mode" && (
        <Box flexDirection="column" gap={0}>
          <Text color="#e8e6e3">Choose access mode  <Text color="#555250">(↑↓ navigate · Enter select)</Text></Text>
          {MODE_OPTIONS.map((option, i) => (
            <Box key={option.id} flexDirection="column" marginBottom={i === MODE_OPTIONS.length - 1 ? 0 : 1}>
              <Text color={i === selectedModeIdx ? "#F97316" : "#888580"}>
                {i === selectedModeIdx ? "▶ " : "  "}
                {option.label}
              </Text>
              <Text color="#555250">
                {i === selectedModeIdx ? "  " : "    "}
                {option.description}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "provider" && (
        <Box flexDirection="column" gap={0}>
          <Text color="#e8e6e3">Select provider  <Text color="#555250">(↑↓ navigate · Enter select · Esc = back)</Text></Text>
          {PROVIDERS.map((p, i) => (
            <Box key={p}>
              <Text color={i === selectedProviderIdx ? "#F97316" : "#888580"}>
                {i === selectedProviderIdx ? "▶ " : "  "}
                {PROVIDER_LABELS[p]}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "model" && (
        <Box flexDirection="column" gap={0}>
          <Text color="#e8e6e3">Select model  <Text color="#555250">(↑↓ navigate · Enter select · Esc = back)</Text></Text>
          {models.map((m, i) => (
            <Box key={m}>
              <Text color={i === selectedModelIdx ? "#F97316" : "#888580"}>
                {i === selectedModelIdx ? "▶ " : "  "}
                {m}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {step === "apikey" && (
        <Box flexDirection="column" gap={0}>
          <Text color="#e8e6e3">
            API key for <Text color="#F97316">{PROVIDER_LABELS[selectedProvider]}</Text>
            {"  "}<Text color="#555250">(Enter save · Esc = back)</Text>
          </Text>
          <Box borderStyle="single" borderColor="#303030" paddingX={1}>
            <Text color="#e8e6e3">
              {apiKey ? "•".repeat(apiKey.length) : <Text color="#555250">paste key and press Enter</Text>}
            </Text>
          </Box>
          {selectedProvider === "ollama" && (
            <Text color="#555250">  Ollama: use any placeholder, e.g. "local"</Text>
          )}
        </Box>
      )}
    </Box>
  );
}
