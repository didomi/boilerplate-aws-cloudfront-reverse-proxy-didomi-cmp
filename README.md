# Didomi reverse proxy - AWS CloudFront setup guide

# Overview

This guide explains how to set up a reverse proxy for Didomi's Privacy Center using AWS CloudFront. Two implementation options are available based on your path requirements:

# Choose Your Implementation

## Option A: Direct path routing

- **Customer usage**: `/api/*` and `/*` paths directly

→ Pure CloudFront behaviors, no Lambda@Edge required

### Architecture

- **CloudFront Distribution** - Routes `/api/*` → `api.privacy-center.org` and `/*` → `sdk.privacy-center.org`
- **Route 53** - DNS management for your domain
- **Custom Origins** - Direct routing to Didomi servers


## Option B: Consent path routing

**Customer usage**: `/consent/*` prefix for all CMP requests

→ CloudFront + Lambda@Edge for URL transformation

### Architecture

- **CloudFront Distribution** - Routes requests to appropriate origins. Matches `/consent/*` → routes to SDK origin
- **Lambda@Edge Function** - Removes `/consent/` prefix before forwarding
- **Route 53** - DNS management for your domain
- **S3 Bucket** - Hosts your static UI files (not required)
- **Custom Origins** - Routes to Didomi servers:
    - `sdk.privacy-center.org` - For SDK files
    - `api.privacy-center.org` - For API requests


## Domain vs Subdomain Trade-offs

<aside>
⚠️

Only Option B works with either setup. Option A, which occupies the main path, works only with a subdomain dedicated to the Didomi CMP.

</aside>

# Implementation guide

## Option A: Direct path routing setup

This setup creates a pure CloudFront configuration. The Didomi SDK will use `/api/*` and `/*` paths through your reverse proxy.

### Step 1: Create SSL Certificate

1. **Go to AWS Certificate Manager (ACM)**
    - Navigate to the **us-east-1** region (N. Virginia)
    - Click "Request certificate"
2. **Request a public certificate**
    - **Domain name**: Your domain (e.g., `cmp.example.com`)
    - **Subject alternative names (SANs)**: Add `.your-domain.com` if you want to support subdomains
    - **Validation method**: DNS validation (recommended) or Email validation
3. **Validate the certificate**
    - If using DNS validation: Add the CNAME records to your DNS provider
    - If using email validation: Check your email and click the validation link
    - Wait for the certificate status to change to "Issued"
4. **Copy the certificate ARN**
    - Once issued, click on the certificate
    - Copy the ARN (format: `arn:aws:acm:us-east-1:ACCOUNT-ID:certificate/CERTIFICATE-ID`)

### Step 2: Create CloudFront Distribution

1. **Go to CloudFront Console**
    - Navigate to AWS CloudFront
    - Click "Create distribution"
2. **Configure Origins**
    
    **Origin 1: Didomi SDK**
    
    
    - **Origin domain**: `sdk.privacy-center.org`
    - **Origin name**: `Didomi-SDK-Origin`
    - **Protocol**: HTTPS only
    - **HTTPS port**: 443
    - **Minimum origin SSL protocol**: TLSv1.2
    
    **Origin 2: Didomi API**
    
    
    - **Origin domain**: `api.privacy-center.org`
    - **Origin name**: `Didomi-API-Origin`
    - **Protocol**: HTTPS only
    - **HTTPS port**: 443
    - **Minimum origin SSL protocol**: TLSv1.2
3. **Configure Cache Behaviors**
    
    **Default Behavior** (catch-all)
    
    - **Path pattern**: `Default (*)`
    - **Origin**: Any (will be overridden by specific behaviors)
    - **Viewer protocol policy**: Redirect HTTP to HTTPS
    - **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    - **Cache policy**: CachingDisabled
    - **Origin request policy**: CORS-S3Origin
    
    **API Behavior**
    
    - **Path pattern**: `/api/*`
    - **Origin**: `Didomi-API-Origin`
    - **Viewer protocol policy**: Redirect HTTP to HTTPS
    - **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    - **Cache policy**: CachingDisabled (no caching for API requests)
    - **Origin request policy**: CORS-S3Origin (forwards all headers)
    
    **SDK Behavior**
    
    - **Path pattern**: `/sdk/*`
    - **Origin**: `Didomi-SDK-Origin`
    - **Viewer protocol policy**: Redirect HTTP to HTTPS
    - **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    - **Cache policy**: CachingOptimized (for static SDK files)
    - **Origin request policy**: CORS-S3Origin
4. **Configure SSL Certificate**
    - **Alternate domain names (CNAMEs)**: Add your domain
    - **SSL certificate**: Custom SSL certificate (select your ACM certificate)
    - **Security policy**: TLSv1.2_2021
5. **Create Distribution**
    - Click "Create distribution"
    - Wait for deployment (5-10 minutes)

### Step 3: Configure DNS

1. **Get CloudFront domain name**
    - Copy the distribution domain name (e.g., `d1abc123def.cloudfront.net`)
2. **Update DNS records**
    - **For subdomain**: Create CNAME record: `cmp.example.com` → `d1abc123def.cloudfront.net`
    - **For root domain**: Create A record pointing to CloudFront IP addresses

## Option B: Consent path routing setup

This setup includes Lambda@Edge for URL transformation. The Didomi SDK will use `/consent/*` prefix for all CMP requests.

**Prerequisites**: Complete Step 1 (SSL Certificate) from Option A above - the process is identical.

### Step 1: Create S3 Bucket for UI (Optional)

### Step2: **Create IAM execution role**8e21e259-f1a0-4350-a6bc-8bcb1c9ec179.png)

1. **Navigate to IAM Console**
    - Go to AWS IAM Console
    - Click "Roles" in the left navigation
2. **Create new role**
    - Click "Create role"
    - Select "AWS service" as the trusted entity type
    - Select "Lambda" use case from the service list
    - Click "Next"
3. **Skip permissions for now**
    - At step 2 (Add permissions), don't add any policies yet
    - Click "Next" to proceed
4. **Configure role details**
    - Enter role name: `lambda-edge-execution-role` (or your preferred name)
    - Optionally add a description: "Execution role for Lambda@Edge functions"
    - Click "Create role"
5. **Create custom permission policy**
    - On the newly created role page, click "Add permissions" → "Create inline policy"
    - Switch to JSON view and paste the following policy:
        
        ```json
        {
            "Version": "1",
            "Statement": [
                {
                    "Action": [
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    "Effect": "Allow",
                    "Resource": "*"
                }
            ]
        }
        ```
        

### Step 3: Create Lambda Function49_PM.png)

1. **Create Lambda function**
    - Go to Lambda Console (us-east-1 region required for Lambda@Edge)
    - Function name: `didomi-cmp-proxy`
    - Runtime: Use latest LTS version
    - Architecture: x86_64 (Lambda@Edge does not support functions with an architecture of arm64)
2. Add the `index.js` file to the lambda:
    1. Create a zip file (`lambda.zip`) with `index.js` at the root
3. **Upload code**
    - Upload the `lambda.zip` file
    - Set handler: `index.handler`
    - Memory: 128 MB
    - Timeout: 30 seconds
4. Set permissions
    - Execution role: Select "Use an existing role" and choose the role created in step 2 (`lambda-edge-execution-role`)

### Lambda Function Code Explanation

The [index.js](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/main/index.js) file contains the core logic for the reverse proxy.

### Main [Handler](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L33) Function

```jsx
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const uri = request.uri;
    const method = request.method;

```

**What it does**: Extracts the request details from the CloudFront event.

### [Path Processing](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L56)

```jsx
// Extract path after /consent/
const pathAfterConsent = uri.substring(8); // Remove '/consent/'

// Check if this is a valid Didomi request
if (!isDidomiRequest(pathAfterConsent)) {
    return { status: '404', ... };
}

```

**What it does**:

- Removes the `/consent/` prefix from the URI
- Validates the path matches Didomi patterns
- Returns 404 for invalid requests

### URI [Modification](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L65)

```jsx
// For both API and SDK requests, keep the full path after /consent/
request.uri = `/${pathAfterConsent}`;

```

**What it does**:

- For API requests (`/consent/api/events`): **Preserves** the `api/` prefix → `/api/events`
- For SDK requests (`/consent/[API_KEY]/loader.js`): Keeps full path → `/[API_KEY]/loader.js`

### Request [Validation](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L11)

```jsx
const DIDOMI_PATTERNS = [
    /^\/.*$/,  // Accept all paths (recommended by Didomi)
    /^\/api\/.*$/  // API patterns
];

```

**What it does**: Validates that the request path matches expected Didomi patterns.

### Step 4: Create CloudFront Distribution

1. **Follow the same process as Option A** for creating the distribution and configuring the Didomi origins (steps 1-2 from Option A)
2. **Configure cache behaviors (KEY DIFFERENCES from Option A)**
    
    **API Behavior** - **DIFFERENT path pattern**
    
    
    - **Path Pattern**: `/consent/api/*` (vs `/api/*` in Option A)
    - **Target Origin**: `Didomi-API-Origin`
    - **Lambda@Edge Association**:
        - Event: `origin-request`
        - Function: Your Lambda function ARN
        - Include body: `true`
    - **Other settings**: Same as Option A API behavior
    
    **SDK Behavior** - **DIFFERENT path pattern**
    
    
    - **Path Pattern**: `/consent/*` (vs `/sdk/*` in Option A)
    - **Target Origin**: `Didomi-SDK-Origin`
    - **Lambda@Edge Association**:
        - Event: `origin-request`
        - Function: Your Lambda function ARN
        - Include body: `true`
    - **Other settings**: Same as Option A SDK behavior
    
    > Important: Behavior order matters - API behavior (/consent/api/*) must come before SDK behavior (/consent/*)
    > 
3. **Configure SSL certificate and DNS**
    - Follow the same SSL certificate and DNS configuration as Option A (Steps 4-5 from Option A)

### Step 5: Publish Lambda Version

1. **Publish new version**
    - Go to Lambda function
    - Click "Actions" → "Publish new version"
    - Note the version number (e.g., 1)
2. **Update CloudFront**
    - Go back to CloudFront distribution
    - Update Lambda function associations to use the published version

# General information

## UI implementation and CMP integration

### Overview

When implementing the reverse proxy for Didomi's Consent Management Platform (CMP), you'll typically integrate the CMP with your existing UI rather than deploying a new one. In most cases, your UI is already in place and only requires adding the Didomi script and configuration. This section covers both the UI deployment process for new setups and the required CMP configuration changes for integration with your reverse proxy.

### CMP Configuration for reverse proxy

The UI deployed in your S3 bucket must include the CMP snippet code with specific modifications to work with your reverse proxy setup.

### Required configuration changes

When implementing the Didomi CMP through your reverse proxy, you must:

1. **Replace the domain**: Change `privacy-center.org` to your reverse proxy domain
2. **Configure API and SDK paths**: Define `sdkPath` and `apiPath` in `didomiConfig`
3. **Set user location**: Configure `user.country` and `user.region`

<aside>
ℹ️

For detailed reverse proxy requirements, consult this [documentation](https://developers.didomi.io/api-and-platform/domains/self-hosting#add-the-user-country-and-region-to-your-notices).

</aside>

### CMP configuration example

```jsx
window.didomiConfig = {
    user: {
        country: "US",
        region: "CA"
    },
    sdkPath: "https://your-domain.com/consent/",
    apiPath: "https://your-domain.com/consent/api/"
};

```

### Complete CMP integration example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Your Website with CMP</title>
    <script>
        window.didomiConfig = {
            user: {
                country: "US"
                region: "CA"
            },
            sdkPath: "https://YOUR_OWN_DOMAIN/consent/",
            apiPath: "https://YOUR_OWN_DOMAIN/consent/api/"
        };
    </script>
    <script type="text/javascript">(function(){function i(e){if(!window.frames[e]){if(document.body&&document.body.firstChild){var t=document.body;var n=document.createElement("iframe");n.style.display="none";n.name=e;n.title=e;t.insertBefore(n,t.firstChild)}else{setTimeout(function(){i(e)},5)}}}function e(n,o,r,f,s){function e(e,t,n,i){if(typeof n!=="function"){return}if(!window[o]){window[o]=[]}var a=false;if(s){a=s(e,i,n)}if(!a){window[o].push({command:e,version:t,callback:n,parameter:i})}}e.stub=true;e.stubVersion=2;function t(i){if(!window[n]||window[n].stub!==true){return}if(!i.data){return}var a=typeof i.data==="string";var e;try{e=a?JSON.parse(i.data):i.data}catch(t){return}if(e[r]){var o=e[r];window[n](o.command,o.version,function(e,t){var n={};n[f]={returnValue:e,success:t,callId:o.callId};if(i.source){i.source.postMessage(a?JSON.stringify(n):n,"*")}},o.parameter)}}if(typeof window[n]!=="function"){window[n]=e;if(window.addEventListener){window.addEventListener("message",t,false)}else{window.attachEvent("onmessage",t)}}}e("__tcfapi","__tcfapiBuffer","__tcfapiCall","__tcfapiReturn");i("__tcfapiLocator")})();</script><script type="text/javascript">(function(){(function(e,r){var t=document.createElement("link");t.rel="preconnect";t.as="script";var n=document.createElement("link");n.rel="dns-prefetch";n.as="script";var i=document.createElement("script");i.id="spcloader";i.type="text/javascript";i["async"]=true;i.charset="utf-8";var o="https://YOUR_OWN_DOMAIN"+e+"/loader.js?target_type=notice&target="+r;if(window.didomiConfig&&window.didomiConfig.user){var a=window.didomiConfig.user;var c=a.country;var d=a.region;if(c){o=o+"&country="+c;if(d){o=o+"&region="+d}}}t.href="https://YOUR_OWN_DOMAIN";n.href="https://YOUR_OWN_DOMAIN";i.src=o;var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s);s.parentNode.insertBefore(n,s);s.parentNode.insertBefore(i,s)})("YOUR_API_KEY","YOUR_NOTICE_ID")})();</script>
</head>
<body>
    <!-- Your website content -->
</body>
</html>

```

## Challenges and Solutions

| Problem | Cause | Solution |
| --- | --- | --- |
| 403 Forbidden for POST Requests | Legacy `forwarded_values` config doesn't support non-cacheable methods | Use modern `cache_policy` and `origin_request_policy` instead |
| Double Slash in URLs | Extra slash added during URI construction | Remove extra slash in Lambda function URI modification |
| Origin Switching in Lambda@Edge | Lambda@Edge doesn't support dynamic origin switching | Use separate CloudFront cache behaviors with different origins |
| Lambda Function Not Updating | Lambda@Edge requires published versions, not `$LATEST` | Always publish new versions and update CloudFront associations |
| CloudWatch Logs Location | Lambda@Edge logs are in us-east-1 region with different log group name | Use correct log group: `/aws/lambda/us-east-1.[function-name]` |

## Important Considerations

### Regional Requirements

- **Lambda@Edge**: Must be created in us-east-1 region
- **ACM Certificate**: Must be in us-east-1 for CloudFront
- **CloudWatch Logs**: Lambda@Edge logs are always in us-east-1

### Deployment Timing

- **Lambda@Edge**: Takes 5-10 minutes to propagate globally
- **CloudFront**: Distribution updates take 1-2 minutes
- **DNS**: Can take up to 48 hours to propagate

### Security

- **HTTPS Only**: Configure redirect-to-https policy
- **CORS**: Lambda function adds CORS headers automatically
- **Origin Validation**: Only allow Didomi domains as origins

### Monitor Logs

```bash
aws logs tail /aws/lambda/us-east-1.didomi-cmp-proxy --region us-east-1 --follow

```

## Troubleshooting

### Common Issues

### For Both Options:

**403 Forbidden**

- Verify cache behavior allows POST requests
- Check origin request policy includes required headers
- Ensure origins are accessible from CloudFront

**404 Not Found**

- Check if request path matches expected patterns (/api/* or /sdk/* for Option A, /consent/* for Option B)
- Verify origins are configured correctly
- Ensure DNS is pointing to CloudFront distribution

**SSL/TLS Errors**

- Verify ACM certificate is valid and in us-east-1 region
- Check that certificate covers your domain
- Ensure origins use HTTPS

### Option B Only (Lambda@Edge):

**502 Bad Gateway**

- Check Lambda function logs in CloudWatch
- Verify Lambda function is published (not using $LATEST)
- Ensure CloudFront is using correct Lambda version

**Lambda Execution Errors**

- Check CloudWatch logs for Lambda@Edge function
- Verify Lambda function has proper permissions
- Ensure Lambda code handles all request types

### Debug Steps

**Check CloudWatch Logs**

- Look for Lambda function execution logs
- Check for errors in request processing

**Verify CloudFront Configuration**

- Check cache behaviors are in correct order
- Verify Lambda associations are correct

**Test Direct Origin Access**

- Test if Didomi origins are accessible directly
- Verify SSL certificates are valid

# Production Setup vs. Test Configuration

For testing purposes, this [boilerplate](https://github.com/didomi/boilerplate-fastly-reverse-proxy-didomi-cmp) includes an embedded HTML template with the Didomi consent notice integration. This allows you to quickly test the consent management functionality without setting up separate UI infrastructure. The template includes the necessary Didomi SDK snippets and demonstrates how the consent notice integrates with your routing logic.

### S3 Bucket setup for UI hosting (Optional)

### Creating the S3 Bucket

1. **Create S3 bucket**
    - Go to S3 Console
    - Create bucket: `your-domain-ui-[account-id]`
    - Enable static website hosting
    - Set index document: `index.html`
2. **Configure bucket policy**
    - Allow CloudFront Origin Access Control (OAC) to read from bucket
    - Ensure proper permissions for static website hosting

### S3 Origin configuration in CloudFront

Add S3 as an origin in your CloudFront distribution:

- **Origin Domain**: Your S3 bucket domain
- **Origin Name**: `UI-S3-Origin`
- **Origin Access**: Origin Access Control (OAC)

### Default Behavior for UI

Configure the default cache behavior to serve your UI:

- **Path Pattern**: `Default (*)`
- **Target Origin**: `UI-S3-Origin`
- **Viewer Protocol Policy**: Redirect HTTP to HTTPS
- **Cache Policy**: CachingOptimized (for static assets)
- **Origin Request Policy**: CORS-S3Origin

### Deployment

### Deployment steps54_PM.png)

1. **Prepare your [HTML files](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/main/example.html)**
    - Ensure your main file is named `index.html`
    - Include the modified CMP snippet code
    
    <aside>
    ⚠️
    
    Before uploading the file, ensure you have changed `YOUR_DOMAIN` to your domain.
    
    </aside>
    
2. **Upload to S3**
3. **Set proper permissions**
    1. Add this permission to the bucket policy in the Permissions tab of the bucket.
    
    ```bash
    {
        "Version": "1",
        "Statement": [
            {
                "Effect": "Allow",
                "Principal": {
                    "Service": "cloudfront.amazonaws.com"
                },
                "Action": "s3:GetObject",
                "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*",
                "Condition": {
                    "StringEquals": {
                        "AWS:SourceArn": "arn:aws:cloudfront::YOUR_AWS_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
                    }
                }
            }
        ]
    }
    ```