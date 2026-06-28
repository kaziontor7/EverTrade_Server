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
