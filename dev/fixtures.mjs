export function fixtures() {
    const descriptions = [
        ['雾港来信', '迟迟', '海风把一封没有落款的信，送到了你经营的旧书店。', '悬疑与慢热关系。你是一名旧书店主，和负责调查失踪案的档案员在雾港相遇。关键线索藏在第三盏灯后。', '悬疑'],
        ['林间的药师', '青苔', '「雨还没停。」她将最后一盏灯点亮，把温热的草药茶放在你面前。', '林间药铺的年轻药师，外冷内热，擅长草药辨识。她的故事以日常、治愈和森林探索为主。', '日常'],
        ['第七次日落', '远山', '广播里传来熟悉的倒计时。你抬头望向天边，太阳正第七次落下。', '时间循环悬疑。城市里的所有人都在重复同一天，只有你和观测员记得昨日。', '悬疑'],
        ['长街听雨', '纸舟', '茶楼的说书声停了。那位戴斗笠的客人，却没有放下手里的茶。', '江湖群像与开放冒险。茶馆、镖局和山庄交织成一个可探索的武侠世界。', '冒险'],
        ['星图以外', '落日信箱', '「舰长，我们偏航了。」舷窗外，星辰正在以陌生的方式排列。', '太空探索。扮演调查舰舰长，与导航员共同发现失落文明。', '冒险'],
        ['今天也要营业', '奶油', '清晨六点，面包房的灯亮了。门铃响起，第一位客人带着一只湿漉漉的小猫。', '经营面包店的轻松日常，可培养朋友关系并解锁食谱。', '日常'],
        ['雾港来信', '另一位作者', '「这封信，是给你的。」陌生旅人从风衣口袋取出一封蓝色的信。', '同名角色测试：这是另一张卡，身份和分组完全独立。', '日常'],
        ['很长的角色名：沿着看不见尽头的旅途直到世界的另一端', '长名字作者', '旅途从这里开始。', '<img src=x onerror="globalThis.cardLibraryXss=true"><script>globalThis.cardLibraryXss=true</script>这段 HTML 应作为文字显示，不执行。', '测试'],
    ];
    return descriptions.map(([name, creator, first_mes, description, type], i) => ({
        avatar: `fixture-${i + 1}.png`, name, description, first_mes, personality: '温和、克制，有自己的目标与边界。', scenario: '一个等待展开的故事。', mes_example: '{{user}}：你好。\n{{char}}：很高兴见到你。',
        chat: '初遇', create_date: `2026-10-${String(i + 10).padStart(2, '0')}`, date_last_chat: 1793700000000 - i * 86400000,
        data: { name, creator, first_mes, description, personality: '温和、克制，有自己的目标与边界。', scenario: '一个等待展开的故事。', creator_notes: '用于开发验证的虚构示例角色。',
            mes_example: '{{user}}：你好。\n{{char}}：很高兴见到你。', alternate_greetings: [`第二个开场：${name}在黄昏时分向你走来。`, i === 0 ? '```html\n<style>.reading-test{color:rgb(167, 92, 30);padding:20px;border:1px solid}</style><article class="reading-test"><h2>蓝色风铃</h2><p>第三个开场：一个关于蓝色风铃的故事。</p><button onclick="parent.cardLibraryXss=true">交互按钮</button><script>parent.cardLibraryXss=true</script></article>\n```' : '第三个开场：一个关于蓝色风铃的故事。'], tags: [type, '示例'],
            character_book: { name: '故事设定', entries: [{ name: '城市与往事', keys: ['雾港'], content: '旧港口的灯塔守望着潮汐，市民称它为归航之星。', enabled: true }] },
            extensions: { world: i === 0 ? '雾港档案' : '', arbitrary_plugin: { keep: true, secretTest: 'do-not-change' }, regex_scripts: i === 0 ? [{ scriptName: '开场阅读排版', findRegex: '/^(海风.+)$/s', replaceString: '<article><h2>雾港来信 · 开场</h2><p>$1</p><p>{{char}} 与 {{user}}</p></article>', placement: [2], markdownOnly: true, trimStrings: [], substituteRegex: 0 }] : [] },
        },
    }));
}
