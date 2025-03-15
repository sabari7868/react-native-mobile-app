require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const AWS = require("aws-sdk");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const ImageSchema = new mongoose.Schema({
  imageUrl: String,
  personName: String,
});
const Image = mongoose.model("Image", ImageSchema);

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
  region: process.env.AWS_REGION,
});

const rekognition = new AWS.Rekognition();

const upload = multer({ storage: multer.memoryStorage() });

app.post("/detect-intruder", upload.single("image"), async (req, res) => {
  const file = req.file;

  if (!file) return res.status(400).send("No image uploaded");

  const params = {
    Bucket: "your-bucket-name",
    Key: `uploads/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  try {
    const uploadedFile = await s3.upload(params).promise();
    const imageUrl = uploadedFile.Location;

    const paramsRekognition = {
      Image: { S3Object: { Bucket: "your-bucket-name", Name: params.Key } },
      MaxLabels: 10,
      MinConfidence: 70,
    };

    const rekognitionResult = await rekognition
      .detectLabels(paramsRekognition)
      .promise();
    const detectedLabels = rekognitionResult.Labels.map((label) => label.Name);

    const isPerson = detectedLabels.includes("Person");
    if (!isPerson) {
      return res.json({ message: "No person detected" });
    }

    const existingImage = await Image.findOne({ imageUrl });
    if (existingImage) {
      return res.json({
        message: `Intruder Detected: ${existingImage.personName}`,
      });
    } else {
      return res.json({ message: "Unknown Person Detected", imageUrl });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing image");
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
