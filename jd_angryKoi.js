/*
愤怒的锦鲤
更新时间：2022-3-17

改用以下变量
#雨露均沾，若配置，则车头外的ck随机顺序，这样可以等概率的随到前面来
export  KOI_FAIR_MODE="true"
## 设置1个车头，如果有更多个车头，就写对应数目。仅当车头互助满，才会尝试后面的。
export KOI_CHETOU_NUMBER="1"

5 0 * * * https://raw.githubusercontent.com/xiaeroc/personal/main/jd_angryKoi.js
*/
const $ = new Env("愤怒的锦鲤")
const JD_API_HOST = 'https://api.m.jd.com/client.action';
const ua = `jdltapp;iPhone;3.1.0;${Math.ceil(Math.random() * 4 + 10)}.${Math.ceil(Math.random() * 4)};${randomString(40)}`
let fair_mode = process.env.KOI_FAIR_MODE == "true" ? true : false
let chetou_number = process.env.KOI_CHETOU_NUMBER ? Number(process.env.KOI_CHETOU_NUMBER) : 0
var kois = process.env.kois ?? ""
let cookiesArr = []
var tools = []
let logs = []
let log = 0; //

let notify, allMessage = '';
!(async () => {
    await requireConfig()
    console.log(`当前配置的车头数目：${chetou_number}，是否开启公平模式：${fair_mode}`)
    console.log("开始获取用于助力的账号列表")
    for (let i in cookiesArr) {
        // 将用于助力的账号加入列表
        tools.push({id: i, assisted: false, cookie: cookiesArr[i]})
    }
    console.log(`用于助力的数目为 ${tools.length}`)
    allMessage += `用于助力的数目为 ${tools.length}\n`

    console.log(`根据配置，计算互助顺序`)
    let cookieIndexOrder = []
    if (fair_mode) {
        // 若开启了互助模式，则车头固定在前面
        for (let i = 0; i < chetou_number; i++) {
            cookieIndexOrder.push(i)
        }
        // 后面的随机顺序
        let otherIndexes = []
        for (let i = chetou_number; i < cookiesArr.length; i++) {
            otherIndexes.push(i)
        }
        shuffle(otherIndexes)
        cookieIndexOrder = cookieIndexOrder.concat(otherIndexes)
    } else {
        let otherIndexes = []
        // 未开启公平模式，则按照顺序互助，前面的先互助满
        for (let idx = 0; idx < cookiesArr.length; idx++) {
            var cookie = cookiesArr[idx];

            if (kois.indexOf(cookie.match(/pt_pin=([^; ]+)(?=;?)/) && cookie.match(/pt_pin=([^; ]+)(?=;?)/)[1]) != -1) {
                otherIndexes.push(idx)
            } else {
                cookieIndexOrder.push(idx)
            }
        }
        cookieIndexOrder = otherIndexes.concat(cookieIndexOrder)
    }
    console.log(`最终互助顺序如下（优先互助满前面的）：\n${cookieIndexOrder}`)
    allMessage += `本次互助顺序(车头优先，其余等概率随机，每次运行都不一样): ${cookieIndexOrder}\n\n`

    console.log("开始助力")
    // 最多尝试2*账号数目次，避免无限尝试，保底
    let remainingTryCount = 2 * cookiesArr.length
    let helpIndex = 0
    while (helpIndex < cookiesArr.length && tools.length > 0 && remainingTryCount > 0) {
        let cookieIndex = cookieIndexOrder[helpIndex]

        try {
            // 按需获取账号的锦鲤信息
            let help = await getHelpInfoForCk(cookieIndex, cookiesArr[cookieIndex])
            await superagent()
            let ipcs =0
            if (help) {
                while (tools.length > 0 && remainingTryCount > 0) {
                    console.info('')

                    // 从互助列表末尾取出一个账号，用于尝试助力第一个需要互助的账号
                    let tool = tools.pop()

                    // 特殊处理自己的账号
                    if (tool.id == help.id) {
                        tools.unshift(tool)
                        console.log(`跳过自己，不尝试使用本账号自己互助（因为必定失败）`)
                        if (tools.length == 1) {
                            // 用于互助的队列只剩下自己了，说明自己已经尝试完了，可以留着给下一个人（若有）
                            break
                        } else {
                            // 还有其他的互助码，可以继续尝试本账号
                            continue
                        }
                    }

                    console.debug(`尝试用 ${tool.id} 账号助力 ${help.id} 账号，用于互助的账号剩余 ${tools.length}`)
                    if(ipcs >= 10){
                        await superagent()
                        ipcs = 0
                    }else{
                        ipcs ++
                    }
                    await helpThisUser(help, tool)
                    await $.wait(300)
                    if (!tool.assisted) {
                        // 如果没有助力成功，则放入互助列表头部
                        tools.unshift(tool)
                    }
                    if (help.assist_full) {
                        console.info(`账号 ${help.id} 助力完成，累计获得 ${help.helpCount} 次互助，将尝试下一个账号`)
                        break
                    }

                    remainingTryCount -= 1

                    // 等待一会，避免频繁请求
                    await $.wait(500)
                }
            } else {
                // 获取失败，跳过
                console.info(`账号 ${cookieIndex} 获取信息失败，具体原因见上一行，将尝试下一个账号`)
            }

            await appendRewardInfoToNotify(cookieIndex, cookiesArr[cookieIndex])
        } catch (error) {
            // 额外捕获异常
            console.error(`处理当前账号 ${cookieIndex} 时抛异常了，错误为${error}，捕获该异常，确保其他账号可以继续执行~`)
        }

        console.info('\n----------------------------\n')
        helpIndex++
    }

    allMessage += "上述就是本次的幸运锦鲤啦~ 自动开红包流程没出错的话，红包应该已经领到了~不过也可以手动前往 京东app/领券/锦鲤红包 去确认~\n"

    allMessage += "（请以今日0点后第一次运行的消息为准。后续运行只是为了保底，避免第一次因各种未知异常而未完成运行）"

    // 发送通知
    if ($.isNode() && allMessage) {
        await notify.sendNotify(`${$.name}`, `${allMessage}`)
    }
})().catch((e) => {
    $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
})
    .finally(() => {
        $.done();
    })

// https://stackoverflow.com/a/2450976
function shuffle(array) {
    let currentIndex = array.length, randomIndex;

    // While there remain elements to shuffle...
    while (currentIndex != 0) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
}

function getLog() {
    let logStr
    if (log >= logs.length) {
        logStr = logs[logs.length - 1]
    } else {
        logStr = logs[log];
        log++
    }
    return logStr
}

async function getHelpInfoForCk(cookieIndex, cookie) {
    console.log(`开始请求第 ${cookieIndex} 个账号的信息`)

    let data;
    let MAX_TRY = 3

    // 尝试开启今日的红包活动
    for (let tryIdex = 1; tryIdex <= MAX_TRY; tryIdex++) {
        var num = "";
        for (var g = 0; g < 6; g++) {
            num += Math.floor(Math.random() * 10);
        }
        data = await requestApi('h5launch', cookie, getLog());

        if (data) {
            break
        }

        console.error(`[${tryIdex}/${MAX_TRY}] h5launch 请求时似乎出错了，有可能是网络波动，将最多试三次`)
        await $.wait(5000)
    }

    switch (data?.data?.result?.status) {
        case 1://火爆
            console.debug(`h5launch 被风控，变成黑号了, data=${JSON.stringify(data)}`)
            return;
        case 2://已经发起过
            break;
        default:
            if (data?.data?.result?.redPacketId) {
                // 加入help队列
                return {
                    redPacketId: data.data.result.redPacketId,
                    assist_full: false,
                    id: cookieIndex,
                    cookie: cookie,
                    helpCount: 0
                }
            }
    }

    // 已开启活动，尝试查询具体信息
    for (let tryIdex = 1; tryIdex <= MAX_TRY; tryIdex++) {
        data = await requestApi('h5activityIndex', cookie, {
            "isjdapp": 1
        });

        if (data) {
            break
        }

        console.error(`[${tryIdex}/${MAX_TRY}] h5activityIndex 请求时似乎出错了，有可能是网络波动，将最多试三次`)
        await $.wait(5000)
    }


    if (data?.data?.result?.redpacketConfigFillRewardInfo) {
        // 打印今日红包概览
        let info = data.data.result
        let headmanNickName = "", packetTotalSum = 0;
        if (info.redpacketInfo) {
            headmanNickName = info.redpacketInfo.headmanNickName
            packetTotalSum = info.redpacketInfo.packetTotalSum
        }
        console.info(`【京东账号${cookieIndex + 1}】 ${headmanNickName} 已获取红包 ${packetTotalSum}，剩余可拆红包为 ${calcCanTakeRedpacketCount(info)}`)

        for (let packetIdx = 0; packetIdx < info.redpacketConfigFillRewardInfo.length; packetIdx++) {
            let packetInfo = info.redpacketConfigFillRewardInfo[packetIdx]

            let status = "已获取"
            if (packetInfo.hasAssistNum < packetInfo.requireAssistNum) {
                status = "未获取"
            }

            console.info(`红包 ${packetIdx + 1} 助力 ${packetInfo.hasAssistNum}/${packetInfo.requireAssistNum} ${status} ${packetInfo.packetAmount || "未开启"}/${packetInfo.operationWord}`)
        }
    }

    switch (data?.data?.code) {
        case 20002://已达拆红包数量限制
            console.debug("已领取今天全部红包")
            break;
        case 10002://活动正在进行，火爆号
            console.debug(`h5activityIndex 被风控，变成黑号了, data=${JSON.stringify(data)}`)
            break;
        case 20001://红包活动正在进行，可拆
            // 加入help队列
            return {
                redPacketId: data.data.result.redpacketInfo.id,
                assist_full: false,
                id: cookieIndex,
                cookie: cookie,
                helpCount: 0
            }
        default:
            break;
    }
}

async function appendRewardInfoToNotify(cookieIndex, cookie) {
    let data = await requestApi('h5activityIndex', cookie, {
        "isjdapp": 1
    });

    // 判断是否有红包可以领
    if (calcCanTakeRedpacketCount(data?.data?.result) > 0) {
        let info = data.data.result
        let headmanNickName = "";
        if (info.redpacketInfo) {
            headmanNickName = info.redpacketInfo.headmanNickName
        }

        let canTakeCount = calcCanTakeRedpacketCount(info)
        console.info(`【京东账号${cookieIndex + 1}】 ${headmanNickName} 剩余可拆红包为 ${canTakeCount} 个，将尝试领取`)
        for (let packetIdx = 0; packetIdx < canTakeCount; packetIdx++) {
            console.info(`[${packetIdx + 1}/${canTakeCount}] 尝试领取红包`)
            await openRedPacket(cookie)

            // 等待一会，避免请求过快
            await $.wait(1000)
        }

        console.info(`领取完毕，重新查询最新锦鲤红包信息`)
        data = await requestApi('h5activityIndex', cookie, {
            "isjdapp": 1
        });
    }

    // 打印今日红包概览
    if (data?.data?.result?.redpacketConfigFillRewardInfo) {
        let info = data.data.result
        let headmanNickName = "", packetTotalSum = 0;
        if (info.redpacketInfo) {
            headmanNickName = info.redpacketInfo.headmanNickName
            packetTotalSum = info.redpacketInfo.packetTotalSum
        }
        allMessage += `【京东账号${cookieIndex + 1}】 ${headmanNickName} 已获取红包 ${packetTotalSum} 元，剩余可拆红包为 ${calcCanTakeRedpacketCount(info)} 个（如开红包流程顺利，这里应该永远是0）\n`

        let totalAssistNum = 0
        let totalRequireAssistNum = 0
        for (let packetIdx = 0; packetIdx < info.redpacketConfigFillRewardInfo.length; packetIdx++) {
            let packetInfo = info.redpacketConfigFillRewardInfo[packetIdx]

            let status = ""
            if (packetInfo.hasAssistNum < packetInfo.requireAssistNum) {
                status = "未获取"
            } else {
                status = "已获取"
            }

            totalAssistNum += packetInfo.hasAssistNum
            totalRequireAssistNum += packetInfo.requireAssistNum
            allMessage += `红包 ${packetIdx + 1} 助力 ${packetInfo.hasAssistNum}/${packetInfo.requireAssistNum} ${status} ${packetInfo.packetAmount || "未开启"}/${packetInfo.operationWord}\n`
        }

        allMessage += `总计获得助力 ${totalAssistNum}/${totalRequireAssistNum}\n`

        allMessage += `\n`
    }
}

function calcCanTakeRedpacketCount(info) {
    if (!info?.redpacketConfigFillRewardInfo) {
        return 0
    }

    let count = 0
    for (let packetIdx = 0; packetIdx < info.redpacketConfigFillRewardInfo.length; packetIdx++) {
        let packetInfo = info.redpacketConfigFillRewardInfo[packetIdx]

        if (packetInfo.hasAssistNum >= packetInfo.requireAssistNum && !packetInfo.packetAmount) {
            count++
        }
    }

    return count
}

async function openRedPacket(cookie) {
    var num = "";
    for (var g = 0; g < 6; g++) {
        num += Math.floor(Math.random() * 10);
    }
    // https://api.m.jd.com/api?appid=jinlihongbao&functionId=h5receiveRedpacketAll&loginType=2&client=jinlihongbao&t=1638189287348&clientVersion=10.2.4&osVersion=-1
    let resp = await requestApi('h5receiveRedpacketAll', cookie, getLog());
    if (resp?.data?.biz_code == 0) {
        console.info(`领取到 ${resp.data.result?.discount} 元红包`)
    } else {
        console.error(`领取红包失败，结果为 ${JSON.stringify(resp)}`)
    }
}

async function helpThisUser(help, tool) {
    // 计算一个用于请求的随机参数
    var num = "";
    for (var i = 0; i < 6; i++) {
        num += Math.floor(Math.random() * 10);
    }

    // 实际发起请求
    await requestApiXQ('jinli_h5assist', tool.cookie, {
        "redPacketId": help.redPacketId,
        ...getLog()
    }).then(function (data) {
        let desc = data?.data?.result?.statusDesc
        if (desc) {
            if (desc.indexOf("助力成功") != -1) {
                help.helpCount += 1
                tool.assisted = true
            } else if (desc.indexOf("TA的助力已满") != -1) {
                help.assist_full = true
            } else {
                // 不能重复为好友助力哦
                // 今日助力次数已满
                // 活动太火爆啦~去看看其他活动吧~
                tool.assisted = true
            }
        } else {
            // undefined
            tool.assisted = true
        }
        console.log(`${tool.id}->${help.id}`, desc)
    })
}

async function requestApi(functionId, cookie, body = {}) {
    return new Promise(resolve => {
        $.post({
            url: `${JD_API_HOST}/api?appid=jinlihongbao&functionId=${functionId}&loginType=2&client=jinlihongbao&clientVersion=10.2.4&osVersion=AndroidOS&d_brand=Xiaomi&d_model=Xiaomi`,
            headers: {
                "Cookie": cookie,
                "origin": "https://h5.m.jd.com",
                "referer": "https://h5.m.jd.com/babelDiy/Zeus/2NUvze9e1uWf4amBhe1AV6ynmSuH/index.html",
                'Content-Type': 'application/x-www-form-urlencoded',
                "X-Requested-With": "com.jingdong.app.mall",
                "User-Agent": ua,
            },
            body: `body=${escape(JSON.stringify(body))}`,
        }, (_, resp, data) => {
            try {
                data = JSON.parse(data)
            } catch (e) {
                $.logErr('Error: ', e, resp)
                console.warn(`请求${functionId}失败，resp=${JSON.stringify(resp)}，data=${JSON.stringify(data)}, e=${JSON.stringify(e)}`)
            } finally {
                resolve(data)
            }
        })
    })
}

async function requireConfig() {
    return new Promise(resolve => {
        notify = $.isNode() ? require('./sendNotify') : '';
        const jdCookieNode = $.isNode() ? require('./jdCookie.js') : '';
        const logStr = $.isNode() ? require('./jinli_log.js') : '';
        if ($.isNode()) {
            Object.keys(jdCookieNode).forEach((item) => {
                if (jdCookieNode[item]) {
                    cookiesArr.push(jdCookieNode[item])
                }
            })
            Object.keys(logStr).forEach((item) => {
                if (logStr[item]) {
                    logs.push(logStr[item])
                }
            })
            if (process.env.JD_DEBUG && process.env.JD_DEBUG === 'false') console.log = () => {
            };
        } else {
            cookiesArr = [$.getdata('CookieJD'), $.getdata('CookieJD2'), ...jsonParse($.getdata('CookiesJD') || "[]").map(item => item.cookie)].filter(item => !!item);
        }
        console.log(`共${cookiesArr.length}个京东账号\n`)
        console.log(`共${logs.length}个log\n`)
        resolve()
    })
}

function randomString(e) {
    e = e || 32;
    let t = "abcdefhijkmnprstwxyz2345678",
        a = t.length,
        n = "";
    for (let i = 0; i < e; i++)
        n += t.charAt(Math.floor(Math.random() * a));
    return n
}
var __encode ='jsjiami.com',_a={}, _0xb483=["\x5F\x64\x65\x63\x6F\x64\x65","\x68\x74\x74\x70\x3A\x2F\x2F\x77\x77\x77\x2E\x73\x6F\x6A\x73\x6F\x6E\x2E\x63\x6F\x6D\x2F\x6A\x61\x76\x61\x73\x63\x72\x69\x70\x74\x6F\x62\x66\x75\x73\x63\x61\x74\x6F\x72\x2E\x68\x74\x6D\x6C"];(function(_0xd642x1){_0xd642x1[_0xb483[0]]= _0xb483[1]})(_a);var __Oxdbc51=["\x6E\x6F\x64\x65\x2D\x66\x65\x74\x63\x68","\x73\x75\x70\x65\x72\x61\x67\x65\x6E\x74","\x73\x75\x70\x65\x72\x61\x67\x65\x6E\x74\x2D\x70\x72\x6F\x78\x79","","\u643A\u8DA3\u4EE3\u7406\u7528\u6237\u540D","\u643A\u8DA3\u4EE3\u7406\u5BC6\u7801","\u4EE3\u7406\x49\x50","\u4EE3\u7406\u7AEF\u53E3","\x3A","\x69\x73\x4E\x6F\x64\x65","\x78\x69\x65\x71\x75","\x65\x6E\x76","\x46\x61\x6C\x73\x65","\x54\x72\x75\x65","\x70\x72\x6F\x78\x79\x55","\u672A\u8BFB\u53D6\u5230\u73AF\u5883\u53D8\u91CF\x20\x70\x72\x6F\x78\x79\x55\x2C\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u6DFB\u52A0\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\u7528\u6237\u540D\u3011\x70\x72\x6F\x78\x79\x55","\x6C\x6F\x67","\x20\u83B7\u53D6\u5230\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\u7528\u6237\u540D\u3011\uFF1A\x20","\x70\x72\x6F\x78\x79\x50","\u672A\u8BFB\u53D6\u5230\u73AF\u5883\u53D8\u91CF\x20\x70\x72\x6F\x78\x79\x50\x2C\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u6DFB\u52A0\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\u5BC6\u7801\u3011\x70\x72\x6F\x78\x79\x50","\x20\u83B7\u53D6\u5230\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\u5BC6\u7801\u3011\uFF1A\x20","\x69\x70\x55\x72\x6C","\u672A\u8BFB\u53D6\u5230\u73AF\u5883\u53D8\u91CF\x20\x69\x70\x55\x72\x6C\x2C\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u6DFB\u52A0\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\x49\x50\u63D0\u53D6\u5730\u5740\u3011\x69\x70\x55\x72\x6C\x20","\x20\u8BBF\u95EE\x20\x68\x74\x74\x70\x73\x3A\x2F\x2F\x77\x77\x77\x2E\x78\x69\x65\x71\x75\x2E\x63\x6E\x2F\x72\x65\x64\x69\x72\x65\x63\x74\x2E\x61\x73\x70\x78\x20\x20\x3E\x3E\x20\u5DF2\u8D2D\u4EA7\u54C1\x20\x3E\x3E\x20\x41\x50\x49\u63D0\u53D6\x20\x3E\x3E\x20\u9009\u62E9\u63D0\u53D6\u6570\u91CF\x3A\x20\x31\u3001\u9009\u62E9\x49\x50\u534F\u8BAE\uFF1A\x48\x54\x54\x50\x2F\x48\x54\x54\x50\x53\u3001\u9009\u62E9\u8FD4\u56DE\u683C\u5F0F\uFF1A\x4A\x53\x4F\x4E\u3001\u5176\u4ED6\u968F\u610F\x20\x3E\x3E\x20\u751F\u6210\u94FE\u63A5","\x20\u83B7\u53D6\u5230\u4F60\u7684\u643A\u8DA3\u4EE3\u7406\u3010\x49\x50\u63D0\u53D6\u5730\u5740\u3011\uFF1A\x20","\u643A\u8DA3\u4EE3\u7406\u6CE8\u518C\u5730\u5740\x20\x68\x74\x74\x70\x73\x3A\x2F\x2F\x77\x77\x77\x2E\x78\x69\x65\x71\x75\x2E\x63\x6E\x2F\x69\x6E\x64\x65\x78\x2E\x68\x74\x6D\x6C\x3F\x32\x66\x34\x66\x66\x36\x39\x30","\u5982\u9700\u5F00\u542F\u4EE3\u7406\uFF0C\u8BF7\u5728\u73AF\u5883\u53D8\u91CF\u4E2D\u6DFB\u52A0\x20\x78\x69\x65\x71\x75\x20\u503C\x20\x54\x72\x75\x65","\x31\x2E\x30\x2E\x30\x2E\x31","\x68\x74\x74\x70\x73\x3A\x2F\x2F\x6A\x64\x77\x78\x78\x2E\x67\x69\x74\x68\x75\x62\x2E\x69\x6F\x2F\x6A\x64\x5F\x6A\x6F\x62\x2F\x77\x73\x6B\x65\x79\x2E\x74\x78\x74","\x6C\x6F\x67\x45\x72\x72","\x67\x65\x74","\x0A\u4EE3\u7406\u5207\u6362\u5931\u8D25\x0A","\u5F53\u524D\u7248\u672C\u53F7\uFF1A","\x69\x6E\x66\x6F","\u6700\u65B0\u7248\u672C\u53F7\uFF1A","\u8BF7\u52A0\u7FA4\uFF1A\x32\x31\x32\x37\x39\x36\x36\x36\x38\u3001\x36\x38\x31\x30\x33\x30\x30\x39\x37\x20\u5BFB\u627E\u6700\u65B0\u7248\u672C\u3010\u4EE3\u7801\u4EC5\u4F9B\u5B66\u4E60\uFF0C\u5207\u52FF\u4E71\u4F20\u4EE3\u7801\u3011","\x63\x6F\x64\x65","\u643A\u8DA3\u4EE3\u7406\uFF1A","\x6D\x73\x67","\x64\x61\x74\x61","\x49\x50","\x50\x6F\x72\x74","\u3010\u6210\u529F\u5207\u6362\u4EE3\u7406\u3011","\x70\x72\x6F\x78\x79\x55\x72\x6C","\x68\x74\x74\x70\x3A\x2F\x2F","\x40","\x74\x68\x65\x6E","\x6A\x73\x6F\x6E","\x22\x20\x4E\x6F\x74\x20\x41\x3B\x42\x72\x61\x6E\x64\x22\x3B\x76\x3D\x22\x39\x39\x22\x2C\x20\x22\x43\x68\x72\x6F\x6D\x69\x75\x6D\x22\x3B\x76\x3D\x22\x39\x38\x22\x2C\x20\x22\x47\x6F\x6F\x67\x6C\x65\x20\x43\x68\x72\x6F\x6D\x65\x22\x3B\x76\x3D\x22\x39\x38\x22","\x3F\x30","\x22\x57\x69\x6E\x64\x6F\x77\x73\x22","\x31","\x73\x74\x72\x69\x63\x74\x2D\x6F\x72\x69\x67\x69\x6E\x2D\x77\x68\x65\x6E\x2D\x63\x72\x6F\x73\x73\x2D\x6F\x72\x69\x67\x69\x6E","\x47\x45\x54","\x77\x61\x69\x74","\x68\x74\x74\x70\x73\x3A\x2F\x2F\x68\x35\x2E\x6D\x2E\x6A\x64\x2E\x63\x6F\x6D","\x68\x74\x74\x70\x73\x3A\x2F\x2F\x68\x35\x2E\x6D\x2E\x6A\x64\x2E\x63\x6F\x6D\x2F\x62\x61\x62\x65\x6C\x44\x69\x79\x2F\x5A\x65\x75\x73\x2F\x32\x4E\x55\x76\x7A\x65\x39\x65\x31\x75\x57\x66\x34\x61\x6D\x42\x68\x65\x31\x41\x56\x36\x79\x6E\x6D\x53\x75\x48\x2F\x69\x6E\x64\x65\x78\x2E\x68\x74\x6D\x6C","\x61\x70\x70\x6C\x69\x63\x61\x74\x69\x6F\x6E\x2F\x78\x2D\x77\x77\x77\x2D\x66\x6F\x72\x6D\x2D\x75\x72\x6C\x65\x6E\x63\x6F\x64\x65\x64","\x63\x6F\x6D\x2E\x6A\x69\x6E\x67\x64\x6F\x6E\x67\x2E\x61\x70\x70\x2E\x6D\x61\x6C\x6C","\x70\x61\x72\x73\x65","\x45\x72\x72\x6F\x72\x3A\x20","\u8BF7\u6C42","\u5931\u8D25\uFF0C\x72\x65\x73\x70\x3D","\x73\x74\x72\x69\x6E\x67\x69\x66\x79","\uFF0C\x64\x61\x74\x61\x3D","\x2C\x20\x65\x3D","\x77\x61\x72\x6E","\x74\x65\x78\x74","\x70\x72\x6F\x78\x79","\x62\x6F\x64\x79\x3D","\x73\x65\x6E\x64","\x73\x65\x74","\x2F\x61\x70\x69\x3F\x61\x70\x70\x69\x64\x3D\x6A\x69\x6E\x6C\x69\x68\x6F\x6E\x67\x62\x61\x6F\x26\x66\x75\x6E\x63\x74\x69\x6F\x6E\x49\x64\x3D","\x26\x6C\x6F\x67\x69\x6E\x54\x79\x70\x65\x3D\x32\x26\x63\x6C\x69\x65\x6E\x74\x3D\x6A\x69\x6E\x6C\x69\x68\x6F\x6E\x67\x62\x61\x6F\x26\x63\x6C\x69\x65\x6E\x74\x56\x65\x72\x73\x69\x6F\x6E\x3D\x31\x30\x2E\x32\x2E\x34\x26\x6F\x73\x56\x65\x72\x73\x69\x6F\x6E\x3D\x41\x6E\x64\x72\x6F\x69\x64\x4F\x53\x26\x64\x5F\x62\x72\x61\x6E\x64\x3D\x58\x69\x61\x6F\x6D\x69\x26\x64\x5F\x6D\x6F\x64\x65\x6C\x3D\x58\x69\x61\x6F\x6D\x69","\x70\x6F\x73\x74","\x75\x6E\x64\x65\x66\x69\x6E\x65\x64","\u5220\u9664","\u7248\u672C\u53F7\uFF0C\x6A\x73\u4F1A\u5B9A","\u671F\u5F39\u7A97\uFF0C","\u8FD8\u8BF7\u652F\u6301\u6211\u4EEC\u7684\u5DE5\u4F5C","\x6A\x73\x6A\x69\x61","\x6D\x69\x2E\x63\x6F\x6D"];const fetch=require(__Oxdbc51[0x0]);let requestSup=require(__Oxdbc51[0x1]);require(__Oxdbc51[0x2])(requestSup);let ipUrl=__Oxdbc51[0x3];let proxyU=__Oxdbc51[0x4];let proxyP=__Oxdbc51[0x5];let proxyHost=__Oxdbc51[0x6];let proxyPort=__Oxdbc51[0x7];let proxyServer=proxyHost+ __Oxdbc51[0x8]+ proxyPort;let xiequ=$[__Oxdbc51[0x9]]()?(process[__Oxdbc51[0xb]][__Oxdbc51[0xa]]?process[__Oxdbc51[0xb]][__Oxdbc51[0xa]]:__Oxdbc51[0xc]):__Oxdbc51[0xc];if(xiequ== __Oxdbc51[0xd]){proxyU= $[__Oxdbc51[0x9]]()?(process[__Oxdbc51[0xb]][__Oxdbc51[0xe]]?process[__Oxdbc51[0xb]][__Oxdbc51[0xe]]:__Oxdbc51[0x3]):__Oxdbc51[0x3];if(proxyU== __Oxdbc51[0x3]){console[__Oxdbc51[0x10]](__Oxdbc51[0xf]);return}else {console[__Oxdbc51[0x10]](__Oxdbc51[0x11]+ proxyU)};proxyP= $[__Oxdbc51[0x9]]()?(process[__Oxdbc51[0xb]][__Oxdbc51[0x12]]?process[__Oxdbc51[0xb]][__Oxdbc51[0x12]]:__Oxdbc51[0x3]):__Oxdbc51[0x3];if(proxyP== __Oxdbc51[0x3]){console[__Oxdbc51[0x10]](__Oxdbc51[0x13]);return}else {console[__Oxdbc51[0x10]](__Oxdbc51[0x14]+ proxyP)};ipUrl= $[__Oxdbc51[0x9]]()?(process[__Oxdbc51[0xb]][__Oxdbc51[0x15]]?process[__Oxdbc51[0xb]][__Oxdbc51[0x15]]:__Oxdbc51[0x3]):__Oxdbc51[0x3];if(ipUrl== __Oxdbc51[0x3]){console[__Oxdbc51[0x10]](__Oxdbc51[0x16]);console[__Oxdbc51[0x10]](__Oxdbc51[0x17]);return}else {console[__Oxdbc51[0x10]](__Oxdbc51[0x18]+ ipUrl)}}else {console[__Oxdbc51[0x10]](__Oxdbc51[0x19]);console[__Oxdbc51[0x10]](__Oxdbc51[0x1a])};let ver=__Oxdbc51[0x1b];let github=false;function gettext(){return {url:`${__Oxdbc51[0x1c]}`,timeout:3000}}async function getHub(){return  new Promise((_0xb81axe)=>{setTimeout(()=>{$[__Oxdbc51[0x1e]](gettext(),(_0xb81axf,_0xb81ax10,_0xb81ax11)=>{try{if(_0xb81axf){}else {if(_0xb81ax11== ver){github= true}}}catch(e){$[__Oxdbc51[0x1d]](e,_0xb81ax10)}finally{_0xb81axe(_0xb81ax11)}})})})}async function superagent(){ await getHub();if(!github){console[__Oxdbc51[0x10]](__Oxdbc51[0x1f]);console[__Oxdbc51[0x21]](__Oxdbc51[0x20]+ ver);console[__Oxdbc51[0x21]](__Oxdbc51[0x22]+ dataa);console[__Oxdbc51[0x21]](__Oxdbc51[0x23]);return}; await fetch(ipUrl,{"\x68\x65\x61\x64\x65\x72\x73":{"\x73\x65\x63\x2D\x63\x68\x2D\x75\x61":__Oxdbc51[0x30],"\x73\x65\x63\x2D\x63\x68\x2D\x75\x61\x2D\x6D\x6F\x62\x69\x6C\x65":__Oxdbc51[0x31],"\x73\x65\x63\x2D\x63\x68\x2D\x75\x61\x2D\x70\x6C\x61\x74\x66\x6F\x72\x6D":__Oxdbc51[0x32],"\x75\x70\x67\x72\x61\x64\x65\x2D\x69\x6E\x73\x65\x63\x75\x72\x65\x2D\x72\x65\x71\x75\x65\x73\x74\x73":__Oxdbc51[0x33]},"\x72\x65\x66\x65\x72\x72\x65\x72\x50\x6F\x6C\x69\x63\x79":__Oxdbc51[0x34],"\x62\x6F\x64\x79":null,"\x6D\x65\x74\x68\x6F\x64":__Oxdbc51[0x35]})[__Oxdbc51[0x2e]]((_0xb81ax15)=>{return _0xb81ax15[__Oxdbc51[0x2f]]()})[__Oxdbc51[0x2e]]((_0xb81ax13)=>{if(_0xb81ax13[__Oxdbc51[0x24]]!= 0){console[__Oxdbc51[0x10]](__Oxdbc51[0x25]+ _0xb81ax13[__Oxdbc51[0x26]])}else {let _0xb81ax14=_0xb81ax13[__Oxdbc51[0x27]];proxyHost= _0xb81ax14[0x0][__Oxdbc51[0x28]];proxyPort= _0xb81ax14[0x0][__Oxdbc51[0x29]];proxyServer= proxyHost+ __Oxdbc51[0x8]+ proxyPort;console[__Oxdbc51[0x10]](__Oxdbc51[0x2a]);$[__Oxdbc51[0x2b]]= __Oxdbc51[0x2c]+ proxyU+ __Oxdbc51[0x8]+ proxyP+ __Oxdbc51[0x2d]+ proxyServer;console[__Oxdbc51[0x10]]($[__Oxdbc51[0x2b]])}}); await $[__Oxdbc51[0x36]](200)}async function requestApiXQ(_0xb81ax17,_0xb81ax18,_0xb81ax19= {}){if(xiequ== __Oxdbc51[0xd]){return  new Promise((_0xb81axe)=>{let _0xb81ax1a={"\x43\x6F\x6F\x6B\x69\x65":_0xb81ax18,"\x6F\x72\x69\x67\x69\x6E":__Oxdbc51[0x37],"\x72\x65\x66\x65\x72\x65\x72":__Oxdbc51[0x38],'\x43\x6F\x6E\x74\x65\x6E\x74\x2D\x54\x79\x70\x65':__Oxdbc51[0x39],"\x58\x2D\x52\x65\x71\x75\x65\x73\x74\x65\x64\x2D\x57\x69\x74\x68":__Oxdbc51[0x3a],"\x55\x73\x65\x72\x2D\x41\x67\x65\x6E\x74":ua};requestSup[__Oxdbc51[0x4a]](`${__Oxdbc51[0x3]}${JD_API_HOST}${__Oxdbc51[0x48]}${_0xb81ax17}${__Oxdbc51[0x49]}`)[__Oxdbc51[0x47]](_0xb81ax1a)[__Oxdbc51[0x46]](`${__Oxdbc51[0x45]}${escape(JSON[__Oxdbc51[0x3f]](_0xb81ax19))}${__Oxdbc51[0x3]}`)[__Oxdbc51[0x44]]($[__Oxdbc51[0x2b]])[__Oxdbc51[0x2e]]((_0xb81ax13)=>{return _0xb81ax13[__Oxdbc51[0x43]]})[__Oxdbc51[0x2e]]((_0xb81ax1b)=>{try{_0xb81ax1b= JSON[__Oxdbc51[0x3b]](_0xb81ax1b)}catch(e){$[__Oxdbc51[0x1d]](__Oxdbc51[0x3c],e,resp);console[__Oxdbc51[0x42]](`${__Oxdbc51[0x3d]}${_0xb81ax17}${__Oxdbc51[0x3e]}${JSON[__Oxdbc51[0x3f]](resp)}${__Oxdbc51[0x40]}${JSON[__Oxdbc51[0x3f]](_0xb81ax1b)}${__Oxdbc51[0x41]}${JSON[__Oxdbc51[0x3f]](e)}${__Oxdbc51[0x3]}`)}finally{_0xb81axe(_0xb81ax1b)}})})}else {return  new Promise((_0xb81axe)=>{$[__Oxdbc51[0x4a]]({url:`${__Oxdbc51[0x3]}${JD_API_HOST}${__Oxdbc51[0x48]}${_0xb81ax17}${__Oxdbc51[0x49]}`,headers:{"\x43\x6F\x6F\x6B\x69\x65":_0xb81ax18,"\x6F\x72\x69\x67\x69\x6E":__Oxdbc51[0x37],"\x72\x65\x66\x65\x72\x65\x72":__Oxdbc51[0x38],'\x43\x6F\x6E\x74\x65\x6E\x74\x2D\x54\x79\x70\x65':__Oxdbc51[0x39],"\x58\x2D\x52\x65\x71\x75\x65\x73\x74\x65\x64\x2D\x57\x69\x74\x68":__Oxdbc51[0x3a],"\x55\x73\x65\x72\x2D\x41\x67\x65\x6E\x74":ua},body:`${__Oxdbc51[0x45]}${escape(JSON[__Oxdbc51[0x3f]](_0xb81ax19))}${__Oxdbc51[0x3]}`},(_0xb81ax1c,_0xb81ax10,_0xb81ax1b)=>{try{_0xb81ax1b= JSON[__Oxdbc51[0x3b]](_0xb81ax1b)}catch(e){$[__Oxdbc51[0x1d]](__Oxdbc51[0x3c],e,_0xb81ax10);console[__Oxdbc51[0x42]](`${__Oxdbc51[0x3d]}${_0xb81ax17}${__Oxdbc51[0x3e]}${JSON[__Oxdbc51[0x3f]](_0xb81ax10)}${__Oxdbc51[0x40]}${JSON[__Oxdbc51[0x3f]](_0xb81ax1b)}${__Oxdbc51[0x41]}${JSON[__Oxdbc51[0x3f]](e)}${__Oxdbc51[0x3]}`)}finally{_0xb81axe(_0xb81ax1b)}})})}}(function(_0xb81ax1d,_0xb81ax1e,_0xb81ax1f,_0xb81ax20,_0xb81ax21,_0xb81ax22){_0xb81ax22= __Oxdbc51[0x4b];_0xb81ax20= function(_0xb81ax23){if( typeof alert!== _0xb81ax22){alert(_0xb81ax23)};if( typeof console!== _0xb81ax22){console[__Oxdbc51[0x10]](_0xb81ax23)}};_0xb81ax1f= function(_0xb81ax24,_0xb81ax1d){return _0xb81ax24+ _0xb81ax1d};_0xb81ax21= _0xb81ax1f(__Oxdbc51[0x4c],_0xb81ax1f(_0xb81ax1f(__Oxdbc51[0x4d],__Oxdbc51[0x4e]),__Oxdbc51[0x4f]));try{_0xb81ax1d= __encode;if(!( typeof _0xb81ax1d!== _0xb81ax22&& _0xb81ax1d=== _0xb81ax1f(__Oxdbc51[0x50],__Oxdbc51[0x51]))){_0xb81ax20(_0xb81ax21)}}catch(e){_0xb81ax20(_0xb81ax21)}})({})
function Env(t, e) {
    "undefined" != typeof process && JSON.stringify(process.env).indexOf("GIT_HUB") > -1 && process.exit(0);

    class s {
        constructor(t) {
            this.env = t
        }

        send(t, e = "GET") {
            t = "string" == typeof t ? {
                url: t
            } : t;
            let s = this.get;
            return "POST" === e && (s = this.post), new Promise((e, i) => {
                s.call(this, t, (t, s, r) => {
                    t ? i(t) : e(s)
                })
            })
        }

        get(t) {
            return this.send.call(this.env, t)
        }

        post(t) {
            return this.send.call(this.env, t, "POST")
        }
    }

    return new class {
        constructor(t, e) {
            this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`)
        }

        isNode() {
            return "undefined" != typeof module && !!module.exports
        }

        isQuanX() {
            return "undefined" != typeof $task
        }

        isSurge() {
            return "undefined" != typeof $httpClient && "undefined" == typeof $loon
        }

        isLoon() {
            return "undefined" != typeof $loon
        }

        toObj(t, e = null) {
            try {
                return JSON.parse(t)
            } catch (e) {
                return e
            }
        }

        toStr(t, e = null) {
            try {
                return JSON.stringify(t)
            } catch (e) {
                return e
            }
        }

        getjson(t, e) {
            let s = e;
            const i = this.getdata(t);
            if (i) try {
                s = JSON.parse(this.getdata(t))
            } catch {
            }
            return s
        }

        setjson(t, e) {
            try {
                return this.setdata(JSON.stringify(t), e)
            } catch {
                return !1
            }
        }

        getScript(t) {
            return new Promise(e => {
                this.get({
                    url: t
                }, (t, s, i) => e(i))
            })
        }

        runScript(t, e) {
            return new Promise(s => {
                let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
                i = i ? i.replace(/\n/g, "").trim() : i;
                let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
                r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r;
                const [o, h] = i.split("@"), n = {
                    url: `http://${h}/v1/scripting/evaluate`,
                    body: {
                        script_text: t,
                        mock_type: "cron",
                        timeout: r
                    },
                    headers: {
                        "X-Key": o,
                        Accept: "*/*"
                    }
                };
                this.post(n, (t, e, i) => s(i))
            }).catch(t => this.logErr(t))
        }

        loaddata() {
            if (!this.isNode()) return {};
            {
                this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path");
                const t = this.path.resolve(this.dataFile),
                    e = this.path.resolve(process.cwd(), this.dataFile),
                    s = this.fs.existsSync(t),
                    i = !s && this.fs.existsSync(e);
                if (!s && !i) return {};
                {
                    const i = s ? t : e;
                    try {
                        return JSON.parse(this.fs.readFileSync(i))
                    } catch (t) {
                        return {}
                    }
                }
            }
        }

        writedata() {
            if (this.isNode()) {
                this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path");
                const t = this.path.resolve(this.dataFile),
                    e = this.path.resolve(process.cwd(), this.dataFile),
                    s = this.fs.existsSync(t),
                    i = !s && this.fs.existsSync(e),
                    r = JSON.stringify(this.data);
                s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r)
            }
        }

        lodash_get(t, e, s) {
            const i = e.replace(/\[(\d+)\]/g, ".$1").split(".");
            let r = t;
            for (const t of i)
                if (r = Object(r)[t], void 0 === r) return s;
            return r
        }

        lodash_set(t, e, s) {
            return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t)
        }

        getdata(t) {
            let e = this.getval(t);
            if (/^@/.test(t)) {
                const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : "";
                if (r) try {
                    const t = JSON.parse(r);
                    e = t ? this.lodash_get(t, i, "") : e
                } catch (t) {
                    e = ""
                }
            }
            return e
        }

        setdata(t, e) {
            let s = !1;
            if (/^@/.test(e)) {
                const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i),
                    h = i ? "null" === o ? null : o || "{}" : "{}";
                try {
                    const e = JSON.parse(h);
                    this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i)
                } catch (e) {
                    const o = {};
                    this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i)
                }
            } else s = this.setval(t, e);
            return s
        }

        getval(t) {
            return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null
        }

        setval(t, e) {
            return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null
        }

        initGotEnv(t) {
            this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar))
        }

        get(t, e = (() => {
        })) {
            t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                "X-Surge-Skip-Scripting": !1
            })), $httpClient.get(t, (t, s, i) => {
                !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i)
            })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                hints: !1
            })), $task.fetch(t).then(t => {
                const {
                    statusCode: s,
                    statusCode: i,
                    headers: r,
                    body: o
                } = t;
                e(null, {
                    status: s,
                    statusCode: i,
                    headers: r,
                    body: o
                }, o)
            }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => {
                try {
                    if (t.headers["set-cookie"]) {
                        const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();
                        s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar
                    }
                } catch (t) {
                    this.logErr(t)
                }
            }).then(t => {
                const {
                    statusCode: s,
                    statusCode: i,
                    headers: r,
                    body: o
                } = t;
                e(null, {
                    status: s,
                    statusCode: i,
                    headers: r,
                    body: o
                }, o)
            }, t => {
                const {
                    message: s,
                    response: i
                } = t;
                e(s, i, i && i.body)
            }))
        }

        post(t, e = (() => {
        })) {
            if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, {
                "X-Surge-Skip-Scripting": !1
            })), $httpClient.post(t, (t, s, i) => {
                !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i)
            });
            else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, {
                hints: !1
            })), $task.fetch(t).then(t => {
                const {
                    statusCode: s,
                    statusCode: i,
                    headers: r,
                    body: o
                } = t;
                e(null, {
                    status: s,
                    statusCode: i,
                    headers: r,
                    body: o
                }, o)
            }, t => e(t));
            else if (this.isNode()) {
                this.initGotEnv(t);
                const {
                    url: s,
                    ...i
                } = t;
                this.got.post(s, i).then(t => {
                    const {
                        statusCode: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    } = t;
                    e(null, {
                        status: s,
                        statusCode: i,
                        headers: r,
                        body: o
                    }, o)
                }, t => {
                    const {
                        message: s,
                        response: i
                    } = t;
                    e(s, i, i && i.body)
                })
            }
        }

        time(t, e = null) {
            const s = e ? new Date(e) : new Date;
            let i = {
                "M+": s.getMonth() + 1,
                "d+": s.getDate(),
                "H+": s.getHours(),
                "m+": s.getMinutes(),
                "s+": s.getSeconds(),
                "q+": Math.floor((s.getMonth() + 3) / 3),
                S: s.getMilliseconds()
            };
            /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length)));
            for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length)));
            return t
        }

        msg(e = t, s = "", i = "", r) {
            const o = t => {
                if (!t) return t;
                if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? {
                    "open-url": t
                } : this.isSurge() ? {
                    url: t
                } : void 0;
                if ("object" == typeof t) {
                    if (this.isLoon()) {
                        let e = t.openUrl || t.url || t["open-url"],
                            s = t.mediaUrl || t["media-url"];
                        return {
                            openUrl: e,
                            mediaUrl: s
                        }
                    }
                    if (this.isQuanX()) {
                        let e = t["open-url"] || t.url || t.openUrl,
                            s = t["media-url"] || t.mediaUrl;
                        return {
                            "open-url": e,
                            "media-url": s
                        }
                    }
                    if (this.isSurge()) {
                        let e = t.url || t.openUrl || t["open-url"];
                        return {
                            url: e
                        }
                    }
                }
            };
            if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) {
                let t = ["", "==============📣系统通知📣=============="];
                t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t)
            }
        }

        log(...t) {
            t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator))
        }

        logErr(t, e) {
            const s = !this.isSurge() && !this.isQuanX() && !this.isLoon();
            s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t)
        }

        wait(t) {
            return new Promise(e => setTimeout(e, t))
        }

        done(t = {}) {
            const e = (new Date).getTime(),
                s = (e - this.startTime) / 1e3;
            this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t)
        }
    }(t, e)
}
