let protobuf;
/* ====== 此处保留你原脚本中的 protobuf 库压缩代码，原样不动 ====== */
!function(g){"use strict";!function(r,e,t){/* ... 原 protobuf 库代码 ... */}({/* modules */},{},[16])}();

const spotifyJson = { /* 原样 */ };

const rules = [ /* 原样，建议把最后一条改成：
    { name: "should_nova_scroll_use_scrollsita", action: "remove" },
    { name: "enable_sponsored_search_results_v3", action: "remove" },
   其它保持一致
*/ ];

/* ===================== 修复后的主逻辑 ===================== */

const resStatus = $response.status || $response.statusCode;

// 跨平台安全获取二进制 body：优先 bodyBytes，避免 Surge/Loon 的 UTF-8 解码损坏
function getBinaryBody() {
    if (typeof $response.bodyBytes !== "undefined") {
        return new Uint8Array($response.bodyBytes);
    }
    if ($response.body instanceof Uint8Array) {
        return $response.body;
    }
    if (typeof $response.body === "string") {
        // 兜底：按 charCode 还原（若 Surge 未开 binary-body-mode，此路径已损坏，仅避免崩溃）
        return Uint8Array.from($response.body, c => c.charCodeAt(0) & 0xff);
    }
    return new Uint8Array($response.body);
}

if (resStatus !== 200) {
    console.log(`$response.status不为200:${resStatus}`);
    $done({});
} else {
    const url = $request.url;
    const method = $request.method;
    const postMethod = "POST";
    const isQuanX = typeof $task !== "undefined";
    const binaryBody = getBinaryBody();
    let body;

    try {
        if (url.includes("bootstrap/v1/bootstrap") && method === postMethod) {
            const bootstrapResponseType = protobuf.Root.fromJSON(spotifyJson).lookupType("BootstrapResponse");
            const bootstrapResponseObj = bootstrapResponseType.decode(binaryBody);

            if (bootstrapResponseObj.trialsFacadeResponseV1) {
                console.log("删除 trialsFacadeResponseV1");
                delete bootstrapResponseObj.trialsFacadeResponseV1;
            }

            const customization = bootstrapResponseObj?.ucsResponseV0?.success?.customization?.success;
            const accountAttributesMapObj = customization?.accountAttributesSuccess?.accountAttributes;
            const assignedValuesMapObj = customization?.resolveSuccess?.configuration?.assignedValues;

            processMapObj(accountAttributesMapObj, assignedValuesMapObj);
            body = bootstrapResponseType.encode(bootstrapResponseObj).finish();
            console.log("bootstrap");
        } else if (url.includes("user-customization-service/v1/customize") && method === postMethod) {
            const ucsResponseWrapperType = protobuf.Root.fromJSON(spotifyJson).lookupType("UcsResponseWrapper");
            const ucsResponseWrapperMessage = ucsResponseWrapperType.decode(binaryBody);

            const accountAttributesMapObj = ucsResponseWrapperMessage?.success?.accountAttributesSuccess?.accountAttributes;
            const assignedValuesMapObj = ucsResponseWrapperMessage?.success?.resolveSuccess?.configuration?.assignedValues;

            processMapObj(accountAttributesMapObj, assignedValuesMapObj);
            body = ucsResponseWrapperType.encode(ucsResponseWrapperMessage).finish();
            console.log("customize");
        } else {
            $notification.post("spotify解锁premium", "路径/请求方法匹配错误:", method + "," + url);
            $done({});
            return;
        }
    } catch (e) {
        console.log(`处理出错: ${e && e.message}\n${e && e.stack}`);
        $notification.post("spotify解锁premium", "处理出错", e && e.message ? e.message : String(e));
        $done({});
        return;
    }

    if (isQuanX) {
        // QuanX 直接传 Uint8Array 最稳（bodyBytes 支持 Uint8Array / ArrayBuffer / number[]）
        $done({ bodyBytes: body });
    } else {
        console.log("eevee-spot-done");
        // Surge / Loon / Stash：Uint8Array 即二进制
        $done({ body });
    }
}

function processMapObj(accountAttributesMapObj, assignedValuesMapObj) {
    if (assignedValuesMapObj) {
        modifyAssignedValues(assignedValuesMapObj);
    }
    if (accountAttributesMapObj) {
        modifyAttributes(accountAttributesMapObj);
    }
}

function modifyAssignedValues(values) {
    // 倒序遍历，删除安全；同时保证 oneof structuredValue 只剩一个字段
    for (const rule of rules) {
        for (let i = values.length - 1; i >= 0; i--) {
            const value = values[i];
            if (!value || !value.propertyId) continue;

            const nameMatches  = rule.name  != null ? value.propertyId.name  === rule.name  : true;
            const scopeMatches = rule.scope != null ? value.propertyId.scope === rule.scope : true;
            if (!nameMatches || !scopeMatches) continue;

            switch (rule.action) {
                case "remove":
                    values.splice(i, 1);
                    if (rule.name)  console.log(`删除${rule.name}`);
                    if (rule.scope) console.log(`删除${rule.scope}`);
                    break;

                case "setBool":
                    // 清理 oneof 其它分支
                    delete values[i].intValue;
                    delete values[i].enumValue;
                    values[i].boolValue = { value: rule.value };
                    if (rule.name)  console.log(`修改${rule.name}的Bool值`);
                    if (rule.scope) console.log(`修改${rule.scope}的Bool值`);
                    break;

                case "setEnum":
                    delete values[i].boolValue;
                    delete values[i].intValue;
                    values[i].enumValue = { value: rule.value };
                    if (rule.name)  console.log(`修改${rule.name}的Enum值`);
                    if (rule.scope) console.log(`修改${rule.scope}的Enum值`);
                    break;

                default:
                    console.log(`未知 action: ${rule.action}`);
            }
        }
    }
    console.log("assignedValuesMapObj processed");
}

function modifyAttributes(attributes) {
    const oneYearFromNow = new Date();
    oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);
    const isoDate = oneYearFromNow.toISOString();

    attributes["ads"] = { boolValue: false };
    attributes["ab-ad-player-targeting"] = { stringValue: "0" };
    attributes["allow-advertising-id-transmission"] = { boolValue: false };
    attributes["restrict-advertising-id-transmission"] = { boolValue: true };
    attributes["can_use_superbird"] = { boolValue: true };
    attributes["catalogue"] = { stringValue: "premium" };
    attributes["financial-product"] = { stringValue: "pr:premium,tc:0" };
    attributes["is-eligible-premium-unboxing"] = { boolValue: true };
    attributes["name"] = { stringValue: "Spotify Premium" };
    attributes["nft-disabled"] = { stringValue: "1" };
    attributes["offline"] = { boolValue: true };
    attributes["on-demand"] = { boolValue: true };
    attributes["payments-initial-campaign"] = { stringValue: "default" };
    attributes["player-license"] = { stringValue: "premium" };
    attributes["player-license-v2"] = { stringValue: "premium" };
    attributes["product-expiry"] = { stringValue: isoDate };
    attributes["shuffle-eligible"] = { boolValue: true };
    attributes["social-session"] = { boolValue: true };
    attributes["social-session-free-tier"] = { boolValue: false };
    attributes["streaming-rules"] = { stringValue: "" };
    attributes["subscription-enddate"] = { stringValue: isoDate };
    attributes["type"] = { stringValue: "premium" };
    attributes["unrestricted"] = { boolValue: true };

    attributes["high-bitrate"] = { boolValue: true };
    attributes["audio-quality"] = { stringValue: "1" };
    attributes["mobile"] = { boolValue: true };
    attributes["mobile-login"] = { boolValue: true };
    attributes["libspotify"] = { boolValue: true };
    attributes["pause-after"] = { longValue: 0 };
    attributes["license-acceptance-grace-days"] = { longValue: 30 };
    attributes["com.spotify.madprops.use.ucs.product.state"] = { boolValue: true };

    delete attributes["ad-use-adlogic"];
    delete attributes["ad-catalogues"];
    delete attributes["shuffle"];
    delete attributes["payment-state"];
    delete attributes["last-premium-activation-date"];
    delete attributes["on-demand-trial"];
    delete attributes["on-demand-trial-in-progress"];
    delete attributes["smart-shuffle"];
    delete attributes["at-signal"];
    delete attributes["feature-set-id-masked"];
    delete attributes["strider-key"];
    delete attributes["is-eligible-for-trial"];
    delete attributes["is-eligible-for-upsell"];
    delete attributes["upsell-state"];
    delete attributes["ad-session-persistence"];
    delete attributes["ad-formats-preroll-video"];

    for (let i = 1; i <= 100; i++) {
        delete attributes[`is-premium-eligible-v${i}`];
    }
    delete attributes["is-premium-eligible"];

    console.log("accountAttributesMapObj processed");
}
