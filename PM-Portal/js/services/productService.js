import { apiClient } from './apiClient.js';

export class ProductService {
  static async getProducts() {
    const data = await apiClient.get('/products');
    return data.products || [];
  }

  static async getProductById(id) {
    const data = await apiClient.get(`/products/${id}`);
    return data.product;
  }

  static async createProduct(productData) {
    const data = await apiClient.post('/products', productData);
    return data.product;
  }

  static async updateProduct(id, updates) {
    const data = await apiClient.patch(`/products/${id}`, updates);
    return data.product;
  }

  static async deleteProduct(id) {
    const data = await apiClient.delete(`/products/${id}`);
    return data;
  }
}
