export type ScenarioOperation =
  | { type: "translate"; east: number; north: number; up: number }
  | { type: "setYPR"; yaw: number; pitch: number; roll: number };

export type Scenario = {
  id: string;
  name: string;
  locationId: string;
  sourceModelId: string;
  targetModelId: string;
  operations: ScenarioOperation[];
};

export const scenarios: Scenario[] = [
  {
    id: "eiffel-north-150",
    name: "Eiffel Tower: translate 150m north",
    locationId: "eiffel-tower",
    sourceModelId: "airplane",
    targetModelId: "drone",
    operations: [{ type: "translate", east: 0, north: 150, up: 0 }]
  },
  {
    id: "statue-east-200-yaw-90",
    name: "Statue of Liberty: 200m east + yaw 90",
    locationId: "statue-liberty",
    sourceModelId: "person",
    targetModelId: "airplane",
    operations: [
      { type: "translate", east: 200, north: 0, up: 0 },
      { type: "setYPR", yaw: 90, pitch: 0, roll: 0 }
    ]
  },
  {
    id: "sydney-ne-150-yaw-45",
    name: "Sydney Opera House: 150m NE + yaw 45",
    locationId: "sydney-opera-house",
    sourceModelId: "balloon",
    targetModelId: "drone",
    operations: [
      { type: "translate", east: 150, north: 150, up: 0 },
      { type: "setYPR", yaw: 45, pitch: -5, roll: 0 }
    ]
  },
  {
    id: "big-ben-west-200-yaw-minus-90",
    name: "Big Ben: 200m west + yaw -90",
    locationId: "big-ben",
    sourceModelId: "truck",
    targetModelId: "vehicle",
    operations: [
      { type: "translate", east: -200, north: 0, up: 0 },
      { type: "setYPR", yaw: -90, pitch: 0, roll: 0 }
    ]
  },
  {
    id: "burj-up-200-yaw-180",
    name: "Burj Khalifa: up 200m + yaw 180",
    locationId: "burj-khalifa",
    sourceModelId: "airplane",
    targetModelId: "balloon",
    operations: [
      { type: "translate", east: 0, north: 0, up: 200 },
      { type: "setYPR", yaw: 180, pitch: -10, roll: 0 }
    ]
  },
  {
    id: "christ-south-120-pitch-minus-15",
    name: "Christ the Redeemer: 120m south + pitch -15",
    locationId: "christ-redeemer",
    sourceModelId: "person",
    targetModelId: "drone",
    operations: [
      { type: "translate", east: 0, north: -120, up: 0 },
      { type: "setYPR", yaw: 0, pitch: -15, roll: 0 }
    ]
  },
  {
    id: "golden-gate-nw-250-yaw-135",
    name: "Golden Gate Bridge: 250m NW + yaw 135",
    locationId: "golden-gate-bridge",
    sourceModelId: "vehicle",
    targetModelId: "airplane",
    operations: [
      { type: "translate", east: -180, north: 180, up: 0 },
      { type: "setYPR", yaw: 135, pitch: 0, roll: 0 }
    ]
  }
];
