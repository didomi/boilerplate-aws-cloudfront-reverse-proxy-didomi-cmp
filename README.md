# AWS Cloudfront

This guide explains how to set up a reverse proxy for Didomi's Privacy Center using AWS CloudFront. Two implementation options are available based on your requirements.

[Choose your implementation](#choose-your-implementation)

[Implementation guide](#implementation-guide)

## Choose your implementation

### Option A: Use a subdomain

To implement a reverse proxy on a subdomain, you will first create an SSL certificate in AWS Certificate Manager, then configure a CloudFront distribution with two origins pointing to\
Didomi's servers. This approach uses pure CloudFront functionality without requiring any serverless functions.

<figure><img src="https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2F0GHyk7ZmIIJsRpt7MYtf%2FServer-side_Setup_Miro_(3).jpg?alt=media&#x26;token=26adeaaf-b091-4904-8443-5c07ecef22a6" alt=""><figcaption></figcaption></figure>

* **Customer usage**: `/api/*` and `/*` paths directly
* **CloudFront Distribution** - Routes `/api/*` → `api.privacy-center.org` and `/*` → `sdk.privacy-center.org`
* **Route 53** - DNS management for your domain
* **Custom Origins** - Direct routing to Didomi servers

### Option B: Use the main domain

To implement a reverse proxy on the main domain, you will first create a Lambda@Edge function to handle URL transformation, then configure a CloudFront distribution that routes `/consent/*` requests through the Lambda function. The Lambda function removes the `/consent/` prefix before forwarding requests to Didomi's servers.

<figure><img src="https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2FVjk3dGSDFy11o7rcaIY6%2FServer-side%20Setup%20Miro%20(2).jpg?alt=media&#x26;token=49a353c9-4b90-48b3-ab6c-d5484998fdae" alt=""><figcaption></figcaption></figure>

* **Customer usage**: `/consent/*` prefix for all CMP requests
* **CloudFront Distribution** - Routes requests to appropriate origins. Matches `/consent/*` → routes to SDK origin
* **Lambda@Edge Function** - Removes `/consent/` prefix before forwarding
* **Route 53** - DNS management for your domain
* **S3 Bucket** - Hosts your static UI files (not required)
* **Custom Origins** - Routes to Didomi servers:
  * `sdk.privacy-center.org` - For SDK files
  * `api.privacy-center.org` - For API requests

### Domain vs Subdomain Trade-offs

> When implementing a reverse proxy for the Didomi SDK and its API events, you need to choose between using your main domain or a dedicated subdomain. This choice has important implications for Safari's cookie restrictions.
For more information, see this [trade-off matrix](https://developers.didomi.io/api-and-platform/domains/reverse-proxy) to select the implementation that suits your requirements.

## Implementation guide

[Option A: Use a subdomain](#option-a-use-a-subdomain)

[Option B: Use the main domain](#option-b-use-the-main-domain)

### Option A: Use a subdomain

This setup creates a pure CloudFront configuration. The Didomi SDK will use `/api/*` and `/*` paths through your reverse proxy.

#### Step 1: Create SSL Certificate

1. **Go to AWS Certificate Manager (ACM)**
   * Navigate to the **us-east-1** region (N. Virginia)
   * Click "Request certificate"
2. **Request a public certificate**
   * **Domain name**: Your domain (e.g., `cmp.example.com`)
   * **Subject alternative names (SANs)**: Add `.your-domain.com` if you want to support subdomains
   * **Validation method**: DNS validation (recommended) or Email validation
3. **Validate the certificate**
   * If using DNS validation: Add the CNAME records to your DNS provider
   * If using email validation: Check your email and click the validation link
   * Wait for the certificate status to change to "Issued"
4. **Copy the certificate ARN**
   * Once issued, click on the certificate
   * Copy the ARN (format: `arn:aws:acm:us-east-1:ACCOUNT-ID:certificate/CERTIFICATE-ID`)

#### Step 2: Create CloudFront Distribution

1. **Go to CloudFront Console**
   * Navigate to AWS CloudFront
   * Click "Create distribution"
2.  **Configure Origins**

    **Origin 1: Didomi SDK**

    * **Origin domain**: `sdk.privacy-center.org`
    * **Origin name**: `Didomi-SDK-Origin`
    * **Protocol**: HTTPS only
    * **HTTPS port**: 443
    * **Minimum origin SSL protocol**: TLSv1.2

    ![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2Ff0FCU9P2OadaImkUbTew%2FCD_ORIGIN_SDK.png?alt=media\&token=6e0c8265-f4e1-4fd5-8487-fe10b7804de5)
3.  **Origin 2: Didomi API**

    * **Origin domain**: `api.privacy-center.org`
    * **Origin name**: `Didomi-API-Origin`
    * **Protocol**: HTTPS only
    * **HTTPS port**: 443
    * **Minimum origin SSL protocol**: TLSv1.2

    ![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2FVNFCWaKNlUnZyzZOD0TA%2FCD_ORIGIN_API.png?alt=media\&token=2975edfe-ffa4-4080-afb8-aed0528e687f)
4.  **Configure Cache Behaviors**

    **Default Behavior** (catch-all)

    * **Path pattern**: `Default (*)`
    * **Origin**: Any (will be overridden by specific behaviors)
    * **Viewer protocol policy**: Redirect HTTP to HTTPS
    * **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    * **Cache policy**: CachingDisabled
    * **Origin request policy**: CORS-S3Origin

    **API Behavior**

    * **Path pattern**: `/api/*`
    * **Origin**: `Didomi-API-Origin`
    * **Viewer protocol policy**: Redirect HTTP to HTTPS
    * **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    * **Cache policy**: CachingDisabled (no caching for API requests)
    * **Origin request policy**: CORS-S3Origin (forwards all headers)

    **SDK Behavior**

    * **Path pattern**: `/sdk/*`
    * **Origin**: `Didomi-SDK-Origin`
    * **Viewer protocol policy**: Redirect HTTP to HTTPS
    * **Allowed HTTP methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE
    * **Cache policy**: CachingOptimized (for static SDK files)
    * **Origin request policy**: CORS-S3Origin
5. **Configure SSL Certificate**
   * **Alternate domain names (CNAMEs)**: Add your domain
   * **SSL certificate**: Custom SSL certificate (select your ACM certificate)
   * **Security policy**: TLSv1.2\_2021
6. **Create Distribution**
   * Click "Create distribution"
   * Wait for deployment (5-10 minutes)

#### Step 3: Configure DNS

1. **Get CloudFront domain name**
   * Copy the distribution domain name (e.g., `d1abc123def.cloudfront.net`)
2. **Update DNS records**
   * **For subdomain**: Create CNAME record: `cmp.example.com` → `d1abc123def.cloudfront.net`
   * **For root domain**: Create A record pointing to CloudFront IP addresses

### Option B: Use the main domain

This setup includes Lambda@Edge for URL transformation. The Didomi SDK will use `/consent/*` prefix for all CMP requests.

**Prerequisites**: Complete Step 1 (SSL Certificate) from Option A above - the process is identical.

#### Step 1: Create S3 Bucket for UI (Optional)

#### Step2: **Create IAM execution role**

![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2F3iSKKXatSEWbHbC6NfDh%2F8e21e259-f1a0-4350-a6bc-8bcb1c9ec179.png?alt=media\&token=15230a14-744a-41d5-a8b9-da8d89d6ae3f)

1. **Navigate to IAM Console**
   * Go to AWS IAM Console
   * Click "Roles" in the left navigation
2. **Create new role**
   * Click "Create role"
   * Select "AWS service" as the trusted entity type
   * Select "Lambda" use case from the service list
   * Click "Next"
3. **Skip permissions for now**
   * At step 2 (Add permissions), don't add any policies yet
   * Click "Next" to proceed
4. **Configure role details**
   * Enter role name: `lambda-edge-execution-role` (or your preferred name)
   * Optionally add a description: "Execution role for Lambda@Edge functions"
   * Click "Create role"
5. **Create custom permission policy**
   * On the newly created role page, click "Add permissions" → "Create inline policy"
   *   Switch to JSON view and paste the following policy:

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

#### Step 3: Create Lambda Function

![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2FPkS3aa0MiZrCgrYdYjew%2FScreenshot_2025-07-15_at_5.50.49_PM.png?alt=media\&token=db33034e-4d6e-4ab2-8e1d-9ed04db55d73)

1. **Create Lambda function**
   * Go to Lambda Console (us-east-1 region required for Lambda@Edge)
   * Function name: `didomi-cmp-proxy`
   * Runtime: Use latest LTS version
   * Architecture: x86\_64 (Lambda@Edge does not support functions with an architecture of arm64)
2. Add the `index.js` file to the lambda:
   1. Create a zip file (`lambda.zip`) with `index.js` at the root
3. **Upload code**
   * Upload the `lambda.zip` file
   * Set handler: `index.handler`
   * Memory: 128 MB
   * Timeout: 30 seconds
4. Set permissions
   * Execution role: Select "Use an existing role" and choose the role created in step 2 (`lambda-edge-execution-role`)

#### Lambda Function Code Explanation

The [index.js](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/main/index.js) file contains the core logic for the reverse proxy.

#### Main [Handler](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L33) Function

```jsx
exports.handler = async (event) => {
    const request = event.Records[0].cf.request;
    const uri = request.uri;
    const method = request.method;

```

**What it does**: Extracts the request details from the CloudFront event.

#### [Path Processing](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L56)

```jsx
// Extract path after /consent/
const pathAfterConsent = uri.substring(8); // Remove '/consent/'

// Check if this is a valid Didomi request
if (!isDidomiRequest(pathAfterConsent)) {
    return { status: '404', ... };
}

```

**What it does**:

* Removes the `/consent/` prefix from the URI
* Validates the path matches Didomi patterns
* Returns 404 for invalid requests

#### URI [Modification](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L65)

```jsx
// For both API and SDK requests, keep the full path after /consent/
request.uri = `/${pathAfterConsent}`;

```

**What it does**:

* For API requests (`/consent/api/events`): **Preserves** the `api/` prefix → `/api/events`
* For SDK requests (`/consent/[API_KEY]/loader.js`): Keeps full path → `/[API_KEY]/loader.js`

#### Request [Validation](https://github.com/didomi/boilerplate-aws-cloudfront-reverse-proxy-didomi-cmp/blob/2b47b3d23dfbb62067090e7f87f392c026f9c1af/index.js#L11)

```jsx
const DIDOMI_PATTERNS = [
    /^\\/.*$/,  // Accept all paths (recommended by Didomi)
    /^\\/api\\/.*$/  // API patterns
];

```

**What it does**: Validates that the request path matches expected Didomi patterns.

#### Step 4: Create CloudFront Distribution

1. **Follow the same process as Option A** for creating the distribution and configuring the Didomi origins (steps 1-2 from Option A)
2.  **Configure cache behaviors (KEY DIFFERENCES from Option A)**

    **API Behavior** - **DIFFERENT path pattern**

![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2FA2fkcQoXAEzkjj9Hm1KF%2FCD_BEHAVIOR_API.png?alt=media\&token=8289bafb-3a91-4455-993c-c34138f38cee)

* **Path Pattern**: `/consent/api/*` (vs `/api/*` in Option A)
* **Target Origin**: `Didomi-API-Origin`
* **Lambda@Edge Association**:
  * Event: `origin-request`
  * Function: Your Lambda function ARN
  * Include body: `true`
* **Other settings**: Same as Option A API behavior



**SDK Behavior** - **DIFFERENT path pattern**

![](https://1703900661-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2F-LDh8ZWDZrXs8sc4QKEQ%2Fuploads%2FSqiFoGDtjeTVYT7MKmwG%2FCD_BEHAVIOR_SDK.png?alt=media\&token=eb618e8f-b7f6-41cb-a2d5-104b2561de14)

* **Path Pattern**: `/consent/*` (vs `/sdk/*` in Option A)
* **Target Origin**: `Didomi-SDK-Origin`
* **Lambda@Edge Association**:
  * Event: `origin-request`
  * Function: Your Lambda function ARN
  * Include body: `true`
* **Other settings**: Same as Option A SDK behavior

> Important: Behavior order matters - API behavior (/consent/api/_) must come before SDK behavior (/consent/_)

1. **Configure SSL certificate and DNS**
   * Follow the same SSL certificate and DNS configuration as Option A (Steps 4-5 from Option A)

#### Step 5: Publish Lambda Version

1. **Publish new version**
   * Go to Lambda function
   * Click "Actions" → "Publish new version"
   * Note the version number (e.g., 1)
2. **Update CloudFront**
   * Go back to CloudFront distribution
   * Update Lambda function associations to use the published version

## General information

### Challenges and solutions

| Problem                         | Cause                                                                  | Solution                                                       |
| ------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| 403 Forbidden for POST Requests | Legacy `forwarded_values` config doesn't support non-cacheable methods | Use modern `cache_policy` and `origin_request_policy` instead  |
| Double Slash in URLs            | Extra slash added during URI construction                              | Remove extra slash in Lambda function URI modification         |
| Origin Switching in Lambda@Edge | Lambda@Edge doesn't support dynamic origin switching                   | Use separate CloudFront cache behaviors with different origins |
| Lambda Function Not Updating    | Lambda@Edge requires published versions, not `$LATEST`                 | Always publish new versions and update CloudFront associations |
| CloudWatch Logs Location        | Lambda@Edge logs are in us-east-1 region with different log group name | Use correct log group: `/aws/lambda/us-east-1.[function-name]` |

### Important Considerations

#### Regional Requirements

* **Lambda@Edge**: Must be created in us-east-1 region
* **ACM Certificate**: Must be in us-east-1 for CloudFront
* **CloudWatch Logs**: Lambda@Edge logs are always in us-east-1

#### Deployment Timing

* **Lambda@Edge**: Takes 5-10 minutes to propagate globally
* **CloudFront**: Distribution updates take 1-2 minutes
* **DNS**: Can take up to 48 hours to propagate

#### Security

* **HTTPS Only**: Configure redirect-to-https policy
* **CORS**: Lambda function adds CORS headers automatically
* **Origin Validation**: Only allow Didomi domains as origins

#### Monitor Logs

```bash
aws logs tail /aws/lambda/us-east-1.didomi-cmp-proxy --region us-east-1 --follow

```

### Troubleshooting

#### Common Issues

#### For Both Options:

**403 Forbidden**

* Verify cache behavior allows POST requests
* Check origin request policy includes required headers
* Ensure origins are accessible from CloudFront

**404 Not Found**

* Check if request path matches expected patterns (/api/\* or /sdk/\* for Option A, /consent/\* for Option B)
* Verify origins are configured correctly
* Ensure DNS is pointing to CloudFront distribution

**SSL/TLS Errors**

* Verify ACM certificate is valid and in us-east-1 region
* Check that certificate covers your domain
* Ensure origins use HTTPS

#### Option B Only (Lambda@Edge):

**502 Bad Gateway**

* Check Lambda function logs in CloudWatch
* Verify Lambda function is published (not using $LATEST)
* Ensure CloudFront is using correct Lambda version

**Lambda Execution Errors**

* Check CloudWatch logs for Lambda@Edge function
* Verify Lambda function has proper permissions
* Ensure Lambda code handles all request types

#### Debug Steps

**Check CloudWatch Logs**

* Look for Lambda function execution logs
* Check for errors in request processing

**Verify CloudFront Configuration**

* Check cache behaviors are in correct order
* Verify Lambda associations are correct

**Test Direct Origin Access**

* Test if Didomi origins are accessible directly
* Verify SSL certificates are valid

***

> After setting up your reverse proxy, update your Didomi SDK snippet to use your own domain instead of `privacy-center.org`. This ensures that the Didomi assets are served from your configured domain. For more information, see the guide to [serving Didomi assets from your domain](https://developers.didomi.io/cmp/web-sdk/serve-didomi-assets-from-your-domain).