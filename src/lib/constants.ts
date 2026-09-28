import { AIModelConfig } from '../types';
import stoolSlide from '../assets/images/microscopy_stool_parasite_1790521911702.jpg';
import bloodSlide from '../assets/images/microscopy_blood_smear_1790521923051.jpg';
import urineSlide from '../assets/images/microscopy_urine_sediment_1790521932151.jpg';
import laboratoryRoom from '../assets/images/laboratory_microscope_room_1790521942556.jpg';

export const LAB_METADATA = {
  name: "LabSight",
  subtitle: "Automated Clinical Microscopy & Decision Support System",
  institution: "Apex Clinical Pathology & Molecular Diagnostic Institute",
  license: "DEMONSTRATION DATA - not an accredited laboratory licence",
  accreditation: "Not accredited. Demonstration configuration only.",
  director: "Dr. L. K. Laurent, MD, FRCPath",
  address: "Medical Center Plaza, Diagnostic Wing 3B, Suite 400",
  contact: "+1 (800) 555-LABS · contact@labsight.ai",
  legalDisclaimer: "CLINICAL DECISION SUPPORT NOTICE: LabSight is demonstration software and is NOT a validated medical device. It must not be used to produce diagnostic reports for patient care. All output requires review by a qualified medical laboratory professional, and the underlying detection models have not been clinically validated."
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
    name: "LABSIGHT vlabsight-1-yolo26m-t1 Logic",
    category: "stool",
    architecture: "YOLO26m Serverless Workflow",
    version: "t1",
    endpoint: "https://serverless.roboflow.com/laurent-kashinje/workflows/labsight-vlabsight-1-yolo26m-t1-logic",
    roboflowWorkspace: "laurent-kashinje",
    roboflowWorkflowId: "labsight-vlabsight-1-yolo26m-t1-logic",
    roboflowModel: "labsight-vlabsight-1-yolo26m-t1-logic",
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
  },
  {
    id: "model-stool-yolo",
    name: "Enteric Parasite & Protozoa Detector",
    category: "stool",
    architecture: "YOLOv11-MicroNet",
    version: "v3.2",
    endpoint: "https://detect.roboflow.com/enteric-parasitology/3",
    roboflowModel: "enteric-parasitology",
    roboflowVersion: "3",
    confidenceThreshold: 0.65,
    iouThreshold: 0.45,
    active: true,
    classes: [
      "Giardia lamblia cyst",
      "Entamoeba histolytica",
      "Ascaris lumbricoides ovum",
      "Hookworm egg",
      "Schistosoma mansoni ovum",
      "Trichuris trichiura"
    ]
  },
  {
    id: "model-blood-yolo",
    name: "Hematology & Hemoparasite Differential",
    category: "blood",
    architecture: "YOLOv11-HemeVision",
    version: "v2.8",
    endpoint: "https://detect.roboflow.com/hematology-smear/2",
    roboflowModel: "hematology-smear",
    roboflowVersion: "2",
    confidenceThreshold: 0.60,
    iouThreshold: 0.40,
    active: true,
    classes: [
      "Erythrocyte (RBC)",
      "Polymorphonuclear Neutrophil",
      "Lymphocyte",
      "Monocyte",
      "Plasmodium falciparum ring",
      "Platelet clump"
    ]
  },
  {
    id: "model-urine-yolo",
    name: "Urinary Sediment & Crystalluria Analyzer",
    category: "urine",
    architecture: "YOLOv8-UroSense",
    version: "v2.1",
    endpoint: "https://detect.roboflow.com/urinary-sediment/2",
    roboflowModel: "urinary-sediment",
    roboflowVersion: "2",
    confidenceThreshold: 0.55,
    iouThreshold: 0.45,
    active: true,
    classes: [
      "Calcium oxalate dihydrate",
      "Pus cell (Leukocyte)",
      "Squamous epithelial cell",
      "Triple phosphate crystal",
      "Uric acid crystal",
      "Hyaline cast"
    ]
  }
];
