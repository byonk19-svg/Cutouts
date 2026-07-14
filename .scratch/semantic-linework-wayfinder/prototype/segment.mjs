import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AutoProcessor,
  AutoTokenizer,
  CLIPSegForImageSegmentation,
  RawImage,
  env
} from "@huggingface/transformers";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.resolve(ROOT, "../corpus");
const WORK = path.join(ROOT, "work");
const RAW = path.join(WORK, "raw");
const MODEL_ID = "Xenova/clipseg-rd64-refined";
const MODEL_REVISION = "924dc94f85f58739f353f94258b33bc47eae4862";

const PROMPTS = [
  { group: "protectedRegions", label: "face", text: "the character's face skin region" },
  { group: "protectedRegions", label: "hair", text: "the character's hair or hat region" },
  { group: "protectedRegions", label: "hands", text: "the character's hands and fingers" },
  { group: "protectedRegions", label: "clothing", text: "the character's main clothing region" },
  { group: "protectedRegions", label: "footwear", text: "the character's boots or shoes" },
  { group: "protectedRegions", label: "accessory", text: "the character's bag lantern or carried accessory" },
  { group: "protectedRegions", label: "fur", text: "the character's fur trim or fluffy collar" },
  { group: "protectedRegions", label: "strap", text: "the character's bag or accessory strap" },
  { group: "importantBoundaries", label: "face-edge", text: "the boundary around the face and facial features" },
  { group: "importantBoundaries", label: "hair-edge", text: "the important boundary between hair or hat and face" },
  { group: "importantBoundaries", label: "garment-seam", text: "important clothing seams openings belt and hem" },
  { group: "importantBoundaries", label: "hand-edge", text: "the boundary around hands and fingers" },
  { group: "importantBoundaries", label: "boot-edge", text: "the boundary around boots or shoes" },
  { group: "importantBoundaries", label: "accessory-edge", text: "the boundary around straps bags lanterns or accessories" }
];

env.cacheDir = path.join(WORK, "model-cache");
env.allowLocalModels = false;

await fs.mkdir(RAW, { recursive: true });
const fixtureManifest = JSON.parse(await fs.readFile(path.join(CORPUS, "generated-files.json"), "utf8"));

const loadStarted = performance.now();
const sharedOptions = { revision: MODEL_REVISION };
const tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, sharedOptions);
const processor = await AutoProcessor.from_pretrained(MODEL_ID, sharedOptions);
const model = await CLIPSegForImageSegmentation.from_pretrained(MODEL_ID, {
  ...sharedOptions,
  dtype: "q4"
});
const modelLoadMs = Math.round(performance.now() - loadStarted);

const summary = {
  provider: "local-transformers-js",
  model: MODEL_ID,
  modelRevision: MODEL_REVISION,
  modelDtype: "q4",
  requestVersion: "clipseg-prompts-v1",
  outputContractVersion: "semantic-selection-v1",
  modelLoadMs,
  prompts: PROMPTS,
  fixtures: []
};

for (const fixture of fixtureManifest.fixtures) {
  const sourcePath = path.join(CORPUS, fixture.source);
  const image = await RawImage.read(sourcePath);
  const imageInputs = await processor(image);
  const started = performance.now();
  const promptLogits = [];
  let outputHeight = 0;
  let outputWidth = 0;
  for (const prompt of PROMPTS) {
    const textInputs = tokenizer([prompt.text], { padding: true, truncation: true });
    const { logits } = await model({ ...textInputs, ...imageInputs });
    outputHeight = logits.dims.at(-2);
    outputWidth = logits.dims.at(-1);
    promptLogits.push(Float32Array.from(logits.data));
  }
  const inferenceMs = Math.round(performance.now() - started);
  const targetDir = path.join(RAW, fixture.id);
  await fs.mkdir(targetDir, { recursive: true });
  const values = new Float32Array(PROMPTS.length * outputHeight * outputWidth);
  promptLogits.forEach((item, index) => values.set(item, index * outputHeight * outputWidth));
  const bytes = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
  await fs.writeFile(path.join(targetDir, "logits.f32"), bytes);
  const metadata = {
    fixture: fixture.id,
    source: fixture.source,
    sourceWidthPx: fixture.width,
    sourceHeightPx: fixture.height,
    logitsDimensions: [PROMPTS.length, outputHeight, outputWidth],
    inferenceMs,
    peakRssBytes: process.memoryUsage().rss,
    prompts: PROMPTS
  };
  await fs.writeFile(path.join(targetDir, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");
  summary.fixtures.push(metadata);
  console.log(`${fixture.id}: ${inferenceMs} ms`);
}

await fs.writeFile(path.join(WORK, "inference-summary.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(`Model load: ${modelLoadMs} ms`);
