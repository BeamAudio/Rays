# Contributing to Beam Audio Rays

We welcome community contributions to the Beam Audio Rays marketplace! Whether you've measured a new speaker or created a custom acoustic profile, here is how to share it with the community.

## How to Submit a Speaker Profile

We use a GitHub Pull Request-based workflow to ensure all models are verified and compatible with the simulation engine.

1.  **Fork the Repository:** Fork the [Beam Audio Rays](https://github.com/BeamAudio/Rays) repository on GitHub.
2.  **Define Your Model:** Create a JSON object representing your speaker. It must follow this structure:
    ```json
    {
      "id": "your_unique_id",
      "name": "Model Name",
      "manufacturer": "Manufacturer Name",
      "type": "Speaker/Line-Array",
      "specs": "A brief description of your speaker model."
    }
    ```
    *Note: If your speaker uses custom directivity, please include the attenuation data as per the `DirectivityPattern` interface.*
3.  **Update Marketplace Data:** Add your JSON object to the `public/marketplace.json` file.
4.  **Submit a Pull Request:** Submit a PR from your fork to our main repository.
5.  **Review & Merge:** Once reviewed by our team, your model will be merged, and the marketplace will be updated automatically via our deployment pipeline.

## Need Help?
If you have questions about how to measure your speaker or define the directivity data, feel free to open a [GitHub Issue](https://github.com/BeamAudio/Rays/issues).
