import { AIModelConfig } from '../types';
import stoolSlide from '../assets/images/microscopy_stool_parasite_1790521911702.jpg';
import bloodSlide from '../assets/images/microscopy_blood_smear_1790521923051.jpg';
import urineSlide from '../assets/images/microscopy_urine_sediment_1790521932151.jpg';
import laboratoryRoom from '../assets/images/laboratory_microscope_room_1790521942556.jpg';

export const LAB_METADATA = {
  name: "LenziAI",
  subtitle: "Automated Clinical Microscopy & Decision Support System",
  license: "LenziAI Diagnostic Systems Inc.",
  accreditation: "Clinical decision support system",
  contact: "+1 (800) 555-LENZ · contact@lenziai.com"
};

// Reference photomicrographs bundled through the module graph so Vite emits
// hashed, cacheable copies into dist/assets. Hardcoded "/src/..." strings are
// NOT processed by the bundler and resolve to nothing in a production build.
export const SLIDE_ASSETS = {
  stool: stoolSlide,
  blood: bloodSlide,
  urine: urineSlide,
  laboratoryBg: laboratoryRoom,
};

export const DEFAULT_AI_MODELS: AIModelConfig[] = [
  {
    id: "model-labsight-yolo26m-workflow",
    name: "LenziAI vlabsight-3-yolo26m-t1 Logic",
    category: "stool",
    architecture: "YOLO26m Serverless Workflow",
    version: "t1",
    endpoint: "https://serverless.roboflow.com/laurent-kashinje-wjafp/workflows/labsight-vlabsight-wji6g-1-yolo26m-t1-logic",
    roboflowWorkspace: "laurent-kashinje-wjafp",
    roboflowWorkflowId: "labsight-vlabsight-wji6g-1-yolo26m-t1-logic",
    roboflowModel: "labsight-vlabsight-wji6g-1-yolo26m-t1-logic",
    roboflowVersion: "1",
    isWorkflow: true,
    /*
     * Detection sensitivity.
     *
     * This is the floor a candidate must clear before it is proposed to a
     * technologist. Raising it raises *precision* — fewer false alarms — and
     * lowers *sensitivity*: an ovum the model calls at 0.28 is now shown to
     * nobody, so it cannot be adjudicated back in.
     *
     * That is a real trade-off on a stool field, where a missed ovum means a
     * false-negative report and a false positive costs one click to reject. The
     * operator sets the floor at 0.60 to cut noise; if specimens start
     * reporting clean while clinical suspicion persists, this number is the
     * first thing to lower.
     *
     * Everything above the floor is still a *candidate*: nothing counts in the
     * report until a person rules on each one.
     */
    confidenceThreshold: 0.60,
    /*
     * Non-maximum suppression is intentionally loose. Ova in a stool field sit
     * close together and their predicted boxes overlap at the edges; a tight
     * threshold folds two neighbouring ova into one and under-counts the
     * specimen, so only a genuine double-box on the same ovum is suppressed.
     */
    iouThreshold: 0.55,
    active: true,
    /*
     * Tiled inference (SAHI-style slicing).
     *
     * A full microscopy field is far larger than the detector's input size, so
     * sending it in one piece forces the provider to downscale and small ova
     * vanish. The slide is read as overlapping tiles and each tile is scaled to
     * the detector's native input, which is what makes a faint ovum a
     * detectable object instead of a few pixels.
     */
    tiling: {
      enabled: true,
      // Detector input size. Tiles are cropped to this so the provider never
      // has to downscale the tile it is asked to read.
      tileSize: 640,
      // Fraction each tile overlaps its neighbour. Overlap keeps an ovum that
      // straddles a tile boundary present whole in at least one tile; the
      // detector's own NMS then merges the duplicate it produces.
      overlap: 0.30
    },
    // Detection targets. Not clinically validated; no accuracy figure
    // exists for this software. Model output requires technologist review
    // and two-person verification before release.
    classes: [
      "Ascaris lumbricoides",
      "Enterobius vermicularis",
      "Fasciolopsis buski",
      "Hookworm egg",
      "Trichuris trichiura"
    ],
    // Parasites reported as confirmed findings when detected.
    reportedParasites: [
      "Ascaris lumbricoides",
      "Enterobius vermicularis",
      "Fasciolopsis buski",
      "Hookworm egg",
      "Trichuris trichiura"
    ]
  }
];
