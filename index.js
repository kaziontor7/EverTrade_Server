const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'EverTrade API is active',
    timestamp: new Date()
  });
});
const uri = process.env.MONGODB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const database = client.db(process.env.MONGODB_DB);
    const usersCollection = database.collection('user');
    const productsCollection = database.collection('products');
    const wishlistCollection = database.collection('wishlist');
    const ordersCollection = database.collection('orders');
    const paymentsCollection = database.collection('payments');
    const cartCollection = database.collection('cart');
    const reviewsCollection = database.collection('reviews');

    // Admin Endpoints
    app.get('/api/admin/stats', async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments();
        const pendingSellers = await usersCollection.countDocuments({ role: 'seller', isVerified: false });
        const totalProducts = await productsCollection.countDocuments();
        const totalOrders = await ordersCollection.countDocuments();

        // Calculate Revenue (5% of delivered orders)
        const deliveredOrders = await ordersCollection.find({ orderStatus: { $regex: /^delivered$/i } }).toArray();
        const totalRevenue = deliveredOrders.reduce((sum, order) => sum + ((order.price || 0) * 0.05), 0);

        const recentOrders = await ordersCollection.find({}).sort({ createdAt: -1 }).limit(5).toArray();
        const recentProducts = await productsCollection.find({}).sort({ createdAt: -1 }).limit(5).toArray();

        res.send({
          totalUsers,
          pendingSellers,
          totalProducts,
          totalOrders,
          totalRevenue,
          recentOrders,
          recentProducts
        });
      } catch (error) {
        console.error("Admin stats error:", error);
        res.status(500).send({ error: "Failed to fetch admin stats" });
      }
    });

    // Admin - Verify Seller
    app.patch('/api/admin/users/:id/verify', async (req, res) => {
      try {
        const userId = req.params.id;
        const { isVerified } = req.body;

        // Update User Collection
        await usersCollection.updateOne(
          { _id: new ObjectId(userId) },
          { $set: { isVerified: isVerified } }
        );

        // Sync verification status to all their products
        await productsCollection.updateMany(
          { sellerId: userId },
          { $set: { sellerVerified: isVerified } }
        );

        res.send({ success: true, isVerified });
      } catch (error) {
        console.error("Admin verify seller error:", error);
        res.status(500).send({ error: "Failed to verify seller" });
      }
    });

    app.get('/users', async (req, res) => {
      const users = await usersCollection.find({}).toArray()
      res.send(users)
    })

    app.get('/api/products', async (req, res) => {
      const query = {}
      if (req.query.sellerId) {
        query.sellerId = req.query.sellerId;
      }

      const cursor = productsCollection.find(query)
      const products = await cursor.toArray()
      res.send(products)
    })
    app.get('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const product = await productsCollection.findOne(query);
        if (product) {
          res.send(product);
        } else {
          res.status(404).send({ message: "Product not found" });
        }
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });


    app.post('/api/products', async (req, res) => {
      const product = req.body;
      const newProduct = {
        ...product,
        createdAt: new Date(),
        isSold: false,
        reported: false
      }
      const result = await productsCollection.insertOne(newProduct);
      res.send(result);
    })

    app.delete('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await productsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    app.patch('/api/products/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const updateData = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: updateData
        };
        const result = await productsCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });
    //wishlist
    app.post('/api/wishlist', async (req, res) => {
      const wishlist = req.body;
      const result = await wishlistCollection.insertOne(wishlist);
      res.send(result)
    })

    app.get('/api/wishlist/:userId', async (req, res) => {
      const userId = req.params.userId;
      const query = { userId: userId };
      const cursor = wishlistCollection.find(query);
      const wishlist = await cursor.toArray();
      res.send(wishlist);
    })

    app.delete('/api/wishlist/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    })

    // Create an Order
    app.post('/api/orders', async (req, res) => {
      try {
        const orderData = req.body;
        orderData.createdAt = new Date();
        orderData.orderStatus = 'processing';
        const result = await ordersCollection.insertOne(orderData);
        res.send(result);
      } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).send({ error: "Failed to create order" });
      }
    });

    // Update Order Status
    app.patch('/api/orders/:id/status', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus: status } }
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to update order status" });
      }
    });

    // Create a Payment record
    app.post('/api/payments', async (req, res) => {
      try {
        const paymentData = req.body;
        paymentData.createdAt = new Date();
        const result = await paymentsCollection.insertOne(paymentData);
        res.send(result);
      } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).send({ error: "Failed to record payment" });
      }
    });

    // Handle Successful Checkout Sync
    app.post('/api/checkout/success', async (req, res) => {
      try {
        const { payment_intent, userId, customerEmail, amount, status } = req.body;

        if (status !== 'complete' && status !== 'paid') {
          return res.status(400).send({ error: "Payment not complete" });
        }

        // 1. Prevent duplicate processing
        const existingPayment = await paymentsCollection.findOne({ transactionId: payment_intent });
        if (existingPayment) {
          return res.send({ success: true, message: "Already processed" });
        }

        // 2. Fetch the user's cart
        const cartItems = await cartCollection.find({ userId }).toArray();
        if (!cartItems || cartItems.length === 0) {
          return res.send({ success: true, message: "Cart was already empty" });
        }

        // 3. Create Orders (mapping to requested schema)
        const orders = cartItems.map(item => ({
          buyerInfo: {
            userId: userId,
            email: customerEmail,
          },
          sellerInfo: {
            userId: item.sellerId,
            name: item.sellerName,
            email: 'seller@evertrade.com' // Fallback if missing
          },
          productId: item.productId || item._id,
          title: item.title,
          price: item.price,
          quantity: item.cartQuantity,
          paymentStatus: "paid",
          orderStatus: "Pending",
          createdAt: new Date(),
          transactionId: payment_intent,
          image: item.images && item.images.length > 0 ? item.images[0] : (item.image || null)
        }));

        await ordersCollection.insertMany(orders);

        // 4. Create Payment Record
        await paymentsCollection.insertOne({
          userId,
          transactionId: payment_intent,
          amount: amount / 100, // Convert subunits back to standard unit
          paymentStatus: "success",
          createdAt: new Date()
        });

        // 5. Clear Cart
        await cartCollection.deleteMany({ userId });

        res.send({ success: true, message: "Order processed successfully" });
      } catch (error) {
        console.error("Checkout Success Error:", error);
        res.status(500).send({ error: "Failed to process checkout success" });
      }
    });

    // Admin - Get All Orders
    app.get('/api/admin/orders', async (req, res) => {
      try {
        const orders = await ordersCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.send(orders);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch all orders" });
      }
    });

    // Admin - Get Analytics Data
    app.get('/api/admin/analytics', async (req, res) => {
      try {
        // 1. User Growth (Users created grouped by month)
        const userGrowth = await usersCollection.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: { $toDate: "$createdAt" } } },
              users: { $sum: 1 }
            }
          },
          { $sort: { "_id": 1 } },
          { $limit: 12 }
        ]).toArray();

        // 2. Category Performance (Products grouped by category)
        const categoryStats = await productsCollection.aggregate([
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray();

        // 3. Monthly Orders (Orders & Revenue grouped by month)
        const monthlyOrders = await ordersCollection.aggregate([
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: { $toDate: "$createdAt" } } },
              orders: { $sum: 1 },
              revenue: { $sum: { $cond: [{ $eq: [{ $toLower: "$orderStatus" }, "delivered"] }, { $multiply: [{ $toDouble: "$price" }, 0.05] }, 0] } }
            }
          },
          { $sort: { "_id": 1 } },
          { $limit: 12 }
        ]).toArray();

        res.send({
          userGrowth: userGrowth.map(item => ({ month: item._id || 'Unknown', users: item.users })),
          categoryStats: categoryStats.map(item => ({ name: item._id || 'Unknown', value: item.count })),
          monthlyOrders: monthlyOrders.map(item => ({ month: item._id || 'Unknown', orders: item.orders, revenue: item.revenue }))
        });
      } catch (error) {
        console.error("Admin analytics error:", error);
        res.status(500).send({ error: "Failed to fetch analytics" });
      }
    });

    // Get Buyer Orders
    app.get('/api/orders/buyer/:userId', async (req, res) => {
      try {
        const userId = req.params.userId;
        const orders = await ordersCollection.find({ "buyerInfo.userId": userId }).sort({ createdAt: -1 }).toArray();
        res.send(orders);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch buyer orders" });
      }
    });

    // Get Orders by Transaction ID
    app.get('/api/orders/transaction/:transactionId', async (req, res) => {
      try {
        const transactionId = req.params.transactionId;
        const orders = await ordersCollection.find({ transactionId: transactionId }).toArray();
        res.send(orders);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch orders for transaction" });
      }
    });

    // Get Seller Orders
    app.get('/api/orders/seller/:userId', async (req, res) => {
      try {
        const userId = req.params.userId;
        const orders = await ordersCollection.find({ "sellerInfo.userId": userId }).sort({ createdAt: -1 }).toArray();
        res.send(orders);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch seller orders" });
      }
    });

    app.patch('/api/orders/:id/status', async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { orderStatus: status }
        };
        const result = await ordersCollection.updateOne(query, updateDoc);
        res.send(result);
      } catch (err) {
        res.status(500).send({ message: err.message });
      }
    });

    // Reviews Endpoints
    app.get('/api/reviews/:productId', async (req, res) => {
      try {
        const productId = req.params.productId;
        const reviews = await reviewsCollection.find({ productId }).sort({ createdAt: -1 }).toArray();
        res.send(reviews);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch reviews" });
      }
    });

    app.get('/api/reviews/eligibility/:productId/:userId', async (req, res) => {
      try {
        const { productId, userId } = req.params;
        const order = await ordersCollection.findOne({
          "buyerInfo.userId": userId,
          productId: productId,
          $or: [{ orderStatus: "delivered" }, { orderStatus: "completed" }]
        });
        if (order) {
          res.send({ eligible: true });
        } else {
          res.send({ eligible: false });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to check review eligibility" });
      }
    });

    app.post('/api/reviews', async (req, res) => {
      try {
        const reviewData = req.body;
        reviewData.createdAt = new Date();
        const result = await reviewsCollection.insertOne(reviewData);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to submit review" });
      }
    });

    // Get Buyer Payments
    app.get('/api/payments/:userId', async (req, res) => {
      try {
        const userId = req.params.userId;
        const payments = await paymentsCollection.find({ userId: userId }).sort({ createdAt: -1 }).toArray();
        res.send(payments);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch payments" });
      }
    });

    // --- CART ENDPOINTS ---
    app.get('/api/cart', async (req, res) => {
      const userId = req.query.userId;
      if (!userId) return res.status(400).send({ error: "Missing userId" });
      const cartItems = await cartCollection.find({ userId }).toArray();
      res.send(cartItems);
    });

    app.post('/api/cart', async (req, res) => {
      const { userId, ...productData } = req.body;
      if (!userId || !productData._id) return res.status(400).send({ error: "Missing data" });

      const existing = await cartCollection.findOne({ userId, productId: productData._id });
      if (existing) {
        const result = await cartCollection.updateOne(
          { _id: existing._id },
          { $set: { cartQuantity: productData.cartQuantity } }
        );
        res.send(result);
      } else {
        // Remove MongoDB's _id so it auto-generates a new unique one for the cart document
        const { _id, ...restProductData } = productData;
        const result = await cartCollection.insertOne({
          userId,
          productId: _id, // keep original product ID here
          ...restProductData,
        });
        res.send(result);
      }
    });

    app.delete('/api/cart/:productId', async (req, res) => {
      const userId = req.query.userId;
      const productId = req.params.productId;
      if (!userId) return res.status(400).send({ error: "Missing userId" });

      const result = await cartCollection.deleteOne({ userId, productId });
      res.send(result);
    });

    app.delete('/api/cart/clear/:userId', async (req, res) => {
      const userId = req.params.userId;
      const result = await cartCollection.deleteMany({ userId });
      res.send(result);
    });



    // Send a ping to confirm a successful connection
    // await database.command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.listen(PORT, () => {
  console.log(`EverTrade Server running on port ${PORT}`);
});
