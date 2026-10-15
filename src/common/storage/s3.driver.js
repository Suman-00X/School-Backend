import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/* AWS S3 or any S3-compatible store (MinIO, R2, Spaces) via S3_ENDPOINT.
   Credentials come from the standard AWS environment/role chain. */
export const createS3Driver = ({ s3Bucket, s3Region, s3Endpoint }) => {
  if (!s3Bucket) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
  const client = new S3Client({
    region: s3Region,
    ...(s3Endpoint && { endpoint: s3Endpoint, forcePathStyle: true })
  });

  return {
    name: "s3",

    put: async (key, body, { contentType } = {}) => {
      await client.send(new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: body, ContentType: contentType }));
      return { key };
    },

    getStream: async key => (await client.send(new GetObjectCommand({ Bucket: s3Bucket, Key: key }))).Body,

    remove: async key => {
      await client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
    },

    signedUrl: (key, { fileName, expiresInSeconds = 900 } = {}) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: s3Bucket,
          Key: key,
          ...(fileName && { ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"` })
        }),
        { expiresIn: expiresInSeconds }
      )
  };
};
