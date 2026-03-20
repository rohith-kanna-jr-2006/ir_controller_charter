import express, { Router, Request, Response } from 'express';
import { Train, ITrain } from '../models/Train';

const router = Router();

/*
 * GET /api/trains
 * Fetch all trains with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, number } = req.query;
    
    let query: any = {};
    if (type) query.type = type;
    if (number) query.number = { $regex: number, $options: 'i' };

    const trains = await Train.find(query).sort({ priority: 1, createdAt: -1 });
    res.json(trains);
  } catch (error) {
    console.error('Error fetching trains:', error);
    res.status(500).json({ error: 'Failed to fetch trains' });
  }
});

/*
 * GET /api/trains/:id
 * Fetch a single train by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const train = await Train.findOne({ id: req.params.id });
    if (!train) {
      return res.status(404).json({ error: 'Train not found' });
    }
    res.json(train);
  } catch (error) {
    console.error('Error fetching train:', error);
    res.status(500).json({ error: 'Failed to fetch train' });
  }
});

/*
 * POST /api/trains
 * Create a new train
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const trainData: Partial<ITrain> = req.body;

    if (!trainData.id || !trainData.number || !trainData.name || !trainData.type || !trainData.color) {
      return res.status(400).json({ error: 'Missing required fields: id, number, name, type, color' });
    }

    // Upsert based on id (which is now based on number)
    const train = await Train.findOneAndUpdate(
      { id: trainData.id },
      trainData,
      { new: true, upsert: true, runValidators: true }
    );
    res.status(201).json(train);
  } catch (error) {
    console.error('Error creating/updating train:', error);
    res.status(500).json({ error: 'Failed to create or update train' });
  }
});

/*
 * PUT /api/trains/:id
 * Update an existing train (upsert)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const trainData: Partial<ITrain> = req.body;

    const train = await Train.findOneAndUpdate(
      { id: req.params.id },
      trainData,
      { new: true, upsert: true, runValidators: true }
    );

    res.json(train);
  } catch (error) {
    console.error('Error updating train:', error);
    res.status(500).json({ error: 'Failed to update train' });
  }
});

/*
 * DELETE /api/trains/:id
 * Delete a train by ID
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await Train.findOneAndDelete({ id: req.params.id });
    if (!result) {
      return res.status(404).json({ error: 'Train not found' });
    }
    res.json({ message: 'Train deleted successfully', train: result });
  } catch (error) {
    console.error('Error deleting train:', error);
    res.status(500).json({ error: 'Failed to delete train' });
  }
});

/*
 * POST /api/trains/bulk/delete
 * Delete multiple trains
 */
router.post('/bulk/delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty ids array' });
    }

    const result = await Train.deleteMany({ id: { $in: ids } });
    res.json({
      message: 'Trains deleted successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error bulk deleting trains:', error);
    res.status(500).json({ error: 'Failed to delete trains' });
  }
});

/*
 * DELETE /api/trains
 * Clear all trains (dangerous - requires confirmation)
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    const { confirm } = req.query;

    if (confirm !== 'true') {
      return res.status(400).json({ error: 'Confirm parameter must be set to "true"' });
    }

    const result = await Train.deleteMany({});
    res.json({
      message: 'All trains deleted successfully',
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

export default router;
