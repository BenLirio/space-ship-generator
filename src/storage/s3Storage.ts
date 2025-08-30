import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { BUCKET } from "../config";

export const s3 = new S3Client({});

export const objectExists = async (Key: string): Promise<boolean> => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
    return true;
  } catch {
    return false;
  }
};

export const putObjectIfAbsent = async (
  Key: string,
  Body: Buffer,
  contentType: string,
  metadata: Record<string, string>
) => {
  if (await objectExists(Key)) return;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key,
      Body,
      ContentType: contentType,
      Metadata: metadata,
    })
  );
};

export const publicUrlForKey = (Key: string): string =>
  `https://${BUCKET}.s3.amazonaws.com/${Key}`;
