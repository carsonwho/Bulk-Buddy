# Bulk Buddy (static site)

How to publish at a URL with **GitHub Pages**:

1) Create a new repo on GitHub (e.g., `bulk-buddy`).  
2) Upload *all files in this folder* so `index.html` sits at the repo root.  
3) Push to the `main` branch.  
4) The included GitHub Action will run and publish to Pages.  
   - Check the Actions tab; the job outputs the site URL (something like `https://<you>.github.io/<repo>/`).  
5) Optional: set a custom domain in **Settings → Pages** (add a `CNAME` file here to lock it).

No build step required — it’s a static site.
