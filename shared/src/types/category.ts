export interface Category {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryInput {
  name: string;
  description?: string | null;
}

