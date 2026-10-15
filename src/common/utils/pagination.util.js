const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export const getPagination = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(query.limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  return { page, limit, skip: (page - 1) * limit };
};
