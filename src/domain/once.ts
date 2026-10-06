export const exclusive = () => {
  let running = false;
  return async (work: () => Promise<void>) => {
    if (running) return false;
    running = true;
    try {
      await work();
    } finally {
      running = false;
    }
    return true;
  };
};
