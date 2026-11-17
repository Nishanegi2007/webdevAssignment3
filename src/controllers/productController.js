import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function parseNumber(value, label, { min = 0, integer = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || (integer && !Number.isInteger(parsed))) {
    const qualifier = integer ? 'a non-negative integer' : 'a non-negative number';
    const error = new Error(`${label} must be ${qualifier}`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 10 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1) {
    const error = new Error('page must be a positive integer');
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error('limit must be an integer between 1 and 100');
    error.status = 400;
    throw error;
  }
  return { page, limit };
}

function parseSort(sortValue) {
  if (!sortValue) return { createdAt: -1 };
  const sort = {};
  for (const rawField of sortValue.split(',')) {
    const descending = rawField.startsWith('-');
    const field = rawField.replace(/^[+-]/, '');
    if (!['name', 'sku', 'category', 'price', 'quantity', 'reorderLevel', 'createdAt', 'updatedAt'].includes(field)) {
      const error = new Error(`Cannot sort by "${field}"`);
      error.status = 400;
      throw error;
    }
    sort[field] = descending || rawField.startsWith('-') ? -1 : 1;
  }
  return sort;
}

export const createProduct = asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
});

export const getProducts = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const filter = {};

  if (req.query.category) filter.category = new RegExp(`^${escapeRegex(req.query.category.trim())}$`, 'i');
  if (req.query.supplier) filter.supplier = new RegExp(escapeRegex(req.query.supplier.trim()), 'i');
  if (req.query.search) {
    const search = escapeRegex(req.query.search.trim());
    filter.$or = [
      { name: new RegExp(search, 'i') },
      { sku: new RegExp(search, 'i') },
      { supplier: new RegExp(search, 'i') },
    ];
  }

  const minPrice = req.query.minPrice ?? req.query.priceMin;
  const maxPrice = req.query.maxPrice ?? req.query.priceMax;
  const minQuantity = req.query.minQuantity;
  const maxQuantity = req.query.maxQuantity;
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = parseNumber(minPrice, 'minPrice');
    if (maxPrice !== undefined) filter.price.$lte = parseNumber(maxPrice, 'maxPrice');
  }
  if (minQuantity !== undefined || maxQuantity !== undefined) {
    filter.quantity = {};
    if (minQuantity !== undefined) filter.quantity.$gte = parseNumber(minQuantity, 'minQuantity', { integer: true });
    if (maxQuantity !== undefined) filter.quantity.$lte = parseNumber(maxQuantity, 'maxQuantity', { integer: true });
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort(parseSort(req.query.sort))
      .skip((page - 1) * limit)
      .limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    count: products.length,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    products,
  });
});

export const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
    context: 'query',
  });
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json({ message: 'Product deleted', id: product.id });
});

export const getLowStockProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ $expr: { $lte: ['$quantity', '$reorderLevel'] } })
    .sort({ quantity: 1, name: 1 });
  res.json({ count: products.length, lowStockItems: products });
});

export const getInventorySummary = asyncHandler(async (req, res) => {
  const summary = await Product.aggregate([
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalStockValue: { $sum: { $multiply: ['$price', '$quantity'] } },
        avgPrice: { $avg: '$price' },
      },
    },
    { $sort: { _id: 1 } },
    {
      $project: {
        _id: 1,
        totalItems: 1,
        totalQuantity: 1,
        totalStockValue: { $round: ['$totalStockValue', 2] },
        avgPrice: { $round: ['$avgPrice', 2] },
      },
    },
  ]);

  res.json({ categories: summary.length, summary });
});

export const adjustStock = asyncHandler(async (req, res) => {
  const change = Number(req.body?.change);
  if (!Number.isInteger(change) || change === 0) {
    return res.status(400).json({ error: 'change must be a non-zero integer (positive to restock, negative for a sale)' });
  }

  const filter = { _id: new mongoose.Types.ObjectId(req.params.id) };
  if (change < 0) filter.quantity = { $gte: Math.abs(change) };

  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: { quantity: change } },
    { new: true, runValidators: true },
  );

  if (product) return res.json({ message: 'Stock updated', product });

  const exists = await Product.exists({ _id: req.params.id });
  if (!exists) return res.status(404).json({ error: 'Product not found' });
  return res.status(409).json({ error: 'Insufficient stock for this adjustment' });
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
