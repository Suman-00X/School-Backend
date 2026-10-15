import SerialCounter from "../models/SerialCounter.js";

export const getNextSerial = async ({
  tenantId,
  scope,
  session
}) => {
  const counter = await SerialCounter.findOneAndUpdate(
    { tenantId, scope },
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true, session }
  );

  return counter.seq;
};
