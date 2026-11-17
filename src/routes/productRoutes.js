import { Router } from 'express';
import {
  adjustStock,
  createProduct,
  deleteProduct,
  getInventorySummary,
  getLowStockProducts,
  getProductById,
  getProducts,
  updateProduct,
} from '../controllers/productController.js';
import { validateProductBody } from '../middleware/validateProduct.js';
import { validateObjectId } from '../middleware/validateObjectId.js';

const router = Router();

router.post('/', validateProductBody(), createProduct);
router.get('/', getProducts);
router.get('/low-stock', getLowStockProducts);
router.get('/summary', getInventorySummary);
router.get('/:id', validateObjectId(), getProductById);
router.put('/:id', validateObjectId(), validateProductBody({ partial: true }), updateProduct);
router.patch('/:id/stock', validateObjectId(), adjustStock);
router.delete('/:id', validateObjectId(), deleteProduct);

export default router;
