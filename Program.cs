using Handyintegrationtest;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using handyapiv3;

var builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });

builder.Services.AddHandyApiV3(options =>
{
    options.ConnectionKey = null;
    // options.ApplicationApiKey = "your-app-id";
    // options.ApiBaseUrl = "https://www.handyfeeling.com/api/handy-rest/v3/";
});

await builder.Build().RunAsync();
