import { AIModelConfig } from '../types';
import stoolSlide from '../assets/images/microscopy_stool_parasite_1790521911702.jpg';
import bloodSlide from '../assets/images/microscopy_blood_smear_1790521923051.jpg';
import urineSlide from '../assets/images/microscopy_urine_sediment_1790521932151.jpg';
import laboratoryRoom from '../assets/images/laboratory_microscope_room_1790521942556.jpg';

export const LAB_METADATA = {
  name: "LabSight",
  subtitle: "Automated Clinical Microscopy & Decision Support System",
  institution: "Apex Clinical Pathology & Molecular Diagnostic Institute",
  license: "Apex Clinical Pathology & Molecular Diagnostic Institute",
  accreditation: "Clinical decision support system",
  director: "Dr. L. K. Laurent, MD, FRCPath",
  address: "Medical Center Plaza, Diagnostic Wing 3B, Suite 400",
  contact: "+1 (800) 555-LABS · contact@labsight.ai",
  legalDisclaimer: "CLINICAL DECISION SUPPORT NOTICE: LabSight provides automated morphology suggestions only. All output requires review and sign-off by a qualified medical laboratory professional prior to clinical release."
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
    name: "LABSIGHT vlabsight-3-yolo26m-t1 Logic",
    category: "stool",
    architecture: "YOLO26m Serverless Workflow",
    version: "t1",
    endpoint: "https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowWorkspace: "laurent-kashinje",
    roboflowWorkflowId: "labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowModel: "labsight-vlabsight-3-yolo26m-t1-logic",
    roboflowVersion: "1",
    isWorkflow: true,
    confidenceThreshold: 0.50,
    iouThreshold: 0.40,
    active: true,
    classes: [
      "Giardia lamblia cyst",
      "Entamoeba histolytica",
      "Ascaris lumbricoides ovum",
      "Hookworm egg",
      "Schistosoma mansoni ovum",
      "Trichuris trichiura"
    ]
  }
];
