export const getTimeDeclaration = {
  name: "get_current_time",
  description: "Get the current time and date in ISO format.",
  parameters: {
    type: "OBJECT",
    properties: {},
  },
};

export async function getTimeExecutor() {
  return new Date().toISOString();
}
