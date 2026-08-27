# START HERE — toolkit WCAG wrapper

```bash
cd Web_Toolkit && npm install --allow-git=all   # first clone / missing engine
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs help
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs core-path
# → …/Web_Toolkit/node_modules/@imyourboyroy/wcagate

node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs doctor --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs init --site-profile ./site.site-profile.json
node ./Web_Toolkit/wcag_auditor/bin/wcag-auditor.mjs run --site-profile ./site.site-profile.json --base-url http://127.0.0.1:4321
```

See [ENGINE.md](./ENGINE.md) and [README.md](./README.md). Never `AI/wcag-auditor`.
