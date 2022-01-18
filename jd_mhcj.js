/*
萌虎摇摇乐
https://yearfestival.jd.com
优先内部互助,剩余次数助力作者
1 0,12,18 * * * jd_tiger.js
转义自HW大佬
const $ = new Env('萌虎摇摇乐');
*/
const name = '萌虎摇摇乐-抽奖'
let UA = process.env.JD_USER_AGENT ? process.env.JD_USER_AGENT : (require('./USER_AGENTS').USER_AGENT)
const got = require('got')
const notify = require('./sendNotify')
const jdCookieNode = require('./jdCookie.js')
let shareCodesSelf = []
let cookiesArr = [],
    cookie
Object.keys(jdCookieNode).forEach((item) => {
        cookiesArr.push(jdCookieNode[item])
    })

!(async () => {
    if (!cookiesArr[0]) {
        console.error('No CK found')
        return
    }

    let authorCode = []
    let res = await getAuthorShareCode('https://gitee.com/KingRan521/JD-Scripts/raw/master/shareCodes/tiger.json')
    if (!res) {
        res = await getAuthorShareCode('https://gitee.com/KingRan521/JD-Scripts/raw/master/shareCodes/tiger.json')
    }
    if (res) {
        authorCode = res.sort(() => 0.5 - Math.random())
        const limit = 3
        if (authorCode.length > limit) {
            authorCode = authorCode.splice(0, limit)
        }
    }

    for (let i = 0; i < cookiesArr.length; i++) {
        cookie = cookiesArr[i]
        const userName = decodeURIComponent(cookie.match(/pt_pin=(.+?);/) && cookie.match(/pt_pin=(.+?);/)[1])
        console.log(`\n开始【京东账号${i + 1}】${userName}\n`)

        let res = await api({ "apiMapping": "/api/index/indexInfo" })
        let lotteryNum = res.data.lotteryNum
        for (let i = 0; i < lotteryNum; i++) {
            res = await api({ "apiMapping": "/api/lottery/lottery" })
            console.log('抽奖：', res.data.prizeName)
            await wait(4000)
        }
    }
})()
.catch((e) => {
    console.error(`${name} error: ${e.stack}`)
})
.finally(() => {
    console.log(`${name} finished}`)
})

async function getAuthorShareCode(url) {
    try {
        const options = {
            url,
            "timeout": 10000,
            headers: {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1 Edg/87.0.4280.88"
            }
        };
        const { body } = await got(options)
        // console.debug('getAuthorShareCode:',body)
        return JSON.parse(body) || []
    } catch (e) {
        // console.warn('getAuthorShareCode:', e)
        return false
    }

}

function wait(time) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve()
        }, time)
    })
}

async function api(r_body) {
    const options = {
        url: 'https://api.m.jd.com/api',
        headers: {
            'Host': 'api.m.jd.com',
            'Origin': 'https://yearfestival.jd.com',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': UA,
            'Referer': 'https://yearfestival.jd.com/',
            'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
            'Cookie': cookie
        },
        form: {
            appid: 'china-joy',
            functionId: 'collect_bliss_cards_prod',
            body: JSON.stringify(r_body),
            t: Date.now(),
            loginType: 2
        }
        // body: `appid=china-joy&functionId=collect_bliss_cards_prod&body=${JSON.stringify(r_body)}&t=${Date.now()}&loginType=2`
    }
    const { body } = await got.post(options)
    // console.debug(options)
    // console.log(body)
    return JSON.parse(body)
}

async function getTaskDetail(taskGroupId) {
    let res = await api({ "taskGroupId": taskGroupId, "apiMapping": "/api/task/brand/getTaskList" })
    await wait(1000)
    for (let t of res.data) {
        if (t.finishNum !== t.totalNum) {
            return t
        }
    }
    return ''
}