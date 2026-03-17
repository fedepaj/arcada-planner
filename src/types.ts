export interface WallNode {
  id: number;
  x: number;
  y: number;
}

export interface Wall {
  id: number;
  a: number;
  b: number;
  exterior: boolean;
}

export interface FurnitureItem {
  id: number;
  path: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  zi: number;
}

export interface FloorState {
  nodes: WallNode[];
  walls: Wall[];
  furniture: FurnitureItem[];
}

export interface CatalogItem {
  name: string;
  imagePath: string;
  width: number;
  height: number;
  zIndex: number;
}
