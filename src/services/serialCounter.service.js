import SerialCounter from "../models/SerialCounter.js";

export const getNextSerial = async ({
  tenantId,
  scope,
  session
}) => {
  const counter = await SerialCounter.findOneAndUpdate(
    { tenantId, scope },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );

  return counter.seq;
};
