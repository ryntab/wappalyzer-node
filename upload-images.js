import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import mime from 'mime';
import { setTimeout } from 'timers/promises';

// Initialize dotenv to use environment variables
dotenv.config();

// Extract environment variables
const {
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_ACCOUNT_ID
} = process.env;

// Configure AWS S3 client with Cloudflare R2 credentials
const s3 = new AWS.S3({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  signatureVersion: 'v4'
});

const clearBucket = async (bucketName) => {
  const params = {
    Bucket: bucketName
  };

  s3.listObjects(params, (err, data) => {
    if (err) {
      console.error(`Error listing objects in ${bucketName}:`, err);
    } else {
      const objects = data.Contents.map(obj => ({ Key: obj.Key }));
      const deleteParams = {
        Bucket: bucketName,
        Delete: {
          Objects: objects
        }
      };

      s3.deleteObjects(deleteParams, (err, data) => {
        if (err) {
          console.error(`Error deleting objects in ${bucketName}:`, err);
        } else {
          console.log(`Successfully deleted all objects in ${bucketName}`);
        }
      });
    }
  });
};

// Utility function to introduce delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Function to upload a single file with retry logic
const uploadFile = async (filePath, bucketName, retryCount = 0) => {
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  const contentType = mime.getType(filePath) || 'application/octet-stream'; // Get the MIME type

  const params = {
    Bucket: bucketName,
    Key: fileName,
    Body: fileContent,
    ContentType: contentType // Set the Content-Type header
  };

  try {
    await s3.upload(params).promise();
    console.log(`Successfully uploaded ${filePath}`);
  } catch (err) {
    if (retryCount < 5) {
      const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff
      console.error(`Error uploading ${filePath}, retrying in ${delayMs / 1000} seconds:`, err);
      await delay(delayMs);
      await uploadFile(filePath, bucketName, retryCount + 1);
    } else {
      console.error(`Failed to upload ${filePath} after multiple attempts:`, err);
    }
  }
};

// Function to upload all files in a directory with rate limiting
const uploadDirectory = async (dirPath, bucketName) => {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    console.log(files.indexOf(file) + 1, '/', files.length)
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isFile()) {
      await uploadFile(filePath, bucketName);
      // await delay(200); // Introduce a delay of 200ms between uploads to handle rate limits
    }
  }
};

// Get the current directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the directory containing images
const directoryPath = path.join(__dirname, './src/icons');

// Clear bucket and upload files in the directory
// clearBucket(R2_BUCKET_NAME)
//   .then(() => uploadDirectory(directoryPath, R2_BUCKET_NAME))
//   .then(() => console.log('Upload process complete'))
//   .catch(err => console.error('Error in upload process:', err));

// Upload files in the directory
uploadDirectory(directoryPath, R2_BUCKET_NAME)
  .then(() => console.log('Upload process complete'))
  .catch(err => console.error('Error in upload process:', err));