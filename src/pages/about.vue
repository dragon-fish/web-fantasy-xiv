<script setup lang="ts"></script>

<template lang="pug">
MenuShell
  MenuBackButton(to="/")
  .about-card
    .about-title 关于本游戏
    p
      | 灵感来源于 Final Fantasy XIV。玩家使用 WASD 操控角色在场地中移动，观察并躲避 Boss 释放的 AOE 攻击预兆，同时尽可能快速地输出以击杀 Boss 通关。
    .about-divider
      .about-section-title 作者
      div
        | dragon-fish |&nbsp;
        a(href="https://github.com/dragon-fish/web-fantasy-xiv" target="_blank" rel="noopener") GitHub
      .about-license GPL-3.0 License
</template>

<style lang="scss" scoped>
.about-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 16px 20px;
  max-width: 440px;
  width: 90%;
  font-size: 12px;
  color: #999;
  line-height: 2;

  a { color: #6af; text-decoration: none; }
}
.about-title {
  font-size: 14px;
  color: #ccc;
  font-weight: bold;
  margin-bottom: 8px;
}
.about-divider {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin-top: 12px;
  padding-top: 12px;
}
.about-section-title {
  color: #ccc;
  margin-bottom: 4px;
}
.about-license {
  margin-top: 4px;
  color: #666;
}
</style>
