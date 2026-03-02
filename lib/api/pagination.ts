/** Parse pagination params from a URL */
export function parsePagination(url: string | URL) {
  const u = typeof url === "string" ? new URL(url) : url;
  const page = Math.max(1, parseInt(u.searchParams.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(u.searchParams.get("limit") || "50")));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/** Build a paginated response envelope */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
) {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
