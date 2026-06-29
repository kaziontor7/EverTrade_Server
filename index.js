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
          orderStatus: "processing",
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
    await database.command({ ping: 1 });
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
