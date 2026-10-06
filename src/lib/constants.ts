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
    endpoint: "https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowWorkspace: "laurent-kashinje",
    roboflowWorkflowId: "labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowModel: "labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowVersion: "1",
    isWorkflow: true,
    confidenceThreshold: 0.30,
    iouThreshold: 0.40,
    active: true,
    classes: [
      "Giardia lamblia cyst",
      "Entamoeba histolytica",
      "Ascaris lumbricoides ovum",
      "Hookworm egg",
      "Schistosoma mansoni ovum",
      "Schistosoma haematobium",
      "Enterobius vermicularis",
      "Trichuris trichiura"
    ]
  }
];
