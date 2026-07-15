import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Cache responses for 30 seconds before marking stale —
      // prevents redundant refetches on tab focus and component remounts.
      staleTime: 30_000,
    },
  },
});
