using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace Loggerr.Ingest;

internal sealed class ApiClient(Uri server, string token) : IDisposable {
  private readonly HttpClient client = new() { BaseAddress = server, Timeout = TimeSpan.FromSeconds(15), DefaultRequestHeaders = { Authorization = new AuthenticationHeaderValue("Bearer", token) } };
  public async Task<IReadOnlyList<IngestFeed>> GetFeedsAsync() { using var response = await client.GetAsync("/api/ingest/feeds"); response.EnsureSuccessStatusCode(); return await response.Content.ReadFromJsonAsync<List<IngestFeed>>(new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? []; }
  public void Dispose() => client.Dispose();
}
